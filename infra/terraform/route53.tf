# Look up the existing hosted zone (created out-of-band, e.g. in the AWS console).
# We don't manage the zone itself, only records inside it.
data "aws_route53_zone" "main" {
  zone_id = var.route53_zone_id
}

locals {
  # All public subdomains terminate on the ALB. The wildcard ACM cert
  # (*.${var.domain} + *.patient/*.doctor/*.admin SANs, see acm.tf) covers
  # every entry here automatically. Adding a new subdomain is a one-line
  # change here + a matching nginx server block in
  # infra/scripts/setup-on-instance.sh.
  #
  # The `*.patient` / `*.doctor` / `*.admin` wildcards serve per-clinic
  # subdomains (harmony.patient.<domain>) — the SPA resolves the tenant from
  # the hostname, so a new clinic needs no DNS/terraform change at all.
  #
  # `minio` proxies to MinIO's S3 API on the box (localhost:9000) so the
  # API can hand out presigned URLs that browsers can actually reach.
  subdomains = [
    "patient", "doctor", "admin", "api", "livekit", "minio",
    "*.patient", "*.doctor", "*.admin",
    # www + apex (below) serve the static under-construction landing from
    # infra/landing (nginx block in setup-on-instance.sh); the ACM cert
    # already carries the apex SAN and *.${var.domain} covers www.
    "www",
  ]
}

# Apex can't live in the for_each above (its record name is the bare domain,
# not <key>.<domain>).
resource "aws_route53_record" "apex" {
  zone_id = data.aws_route53_zone.main.zone_id
  name    = var.domain
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}

# All subdomains point at the ALB. The LiveKit subdomain is also on the ALB
# (for the WSS handshake). Actual UDP RTP traffic goes directly to the EIP
# attached to the EC2 instance — clients learn that IP from the ICE candidates
# returned by LiveKit (LIVEKIT_NODE_IP env var on the box).
resource "aws_route53_record" "subdomains" {
  for_each = toset(local.subdomains)

  zone_id = data.aws_route53_zone.main.zone_id
  name    = "${each.key}.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}
