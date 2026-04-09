resource "aws_route53_zone" "main" {
  name = var.domain

  tags = {
    Name = var.domain
  }
}

locals {
  subdomains = ["patient", "doctor", "admin", "api", "livekit"]
}

# All subdomains point at the ALB. The LiveKit subdomain is also on the ALB
# (for the WSS handshake). Actual UDP RTP traffic goes directly to the EIP
# attached to the EC2 instance — clients learn that IP from the ICE candidates
# returned by LiveKit (LIVEKIT_NODE_IP env var on the box).
resource "aws_route53_record" "subdomains" {
  for_each = toset(local.subdomains)

  zone_id = aws_route53_zone.main.zone_id
  name    = "${each.key}.${var.domain}"
  type    = "A"

  alias {
    name                   = aws_lb.app.dns_name
    zone_id                = aws_lb.app.zone_id
    evaluate_target_health = true
  }
}
