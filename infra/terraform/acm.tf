resource "aws_acm_certificate" "wildcard" {
  domain_name       = "*.${var.domain}"
  validation_method = "DNS"

  # Apex SAN in case anything ever uses it, plus second-level wildcards for
  # per-clinic subdomains (harmony.patient.<domain> etc.) — a single-level
  # wildcard does not cover two labels deep.
  subject_alternative_names = [
    var.domain,
    "*.patient.${var.domain}",
    "*.doctor.${var.domain}",
    "*.admin.${var.domain}",
  ]

  lifecycle {
    create_before_destroy = true
  }

  tags = {
    Name = "telemed-demo-wildcard"
  }
}

# Route 53 records that prove ownership for ACM DNS-01 challenge.
resource "aws_route53_record" "cert_validation" {
  for_each = {
    for dvo in aws_acm_certificate.wildcard.domain_validation_options : dvo.domain_name => {
      name   = dvo.resource_record_name
      record = dvo.resource_record_value
      type   = dvo.resource_record_type
    }
  }

  allow_overwrite = true
  zone_id         = data.aws_route53_zone.main.zone_id
  name            = each.value.name
  type            = each.value.type
  ttl             = 60
  records         = [each.value.record]
}

# Blocks until ACM has verified the cert via the records above.
resource "aws_acm_certificate_validation" "wildcard" {
  certificate_arn         = aws_acm_certificate.wildcard.arn
  validation_record_fqdns = [for r in aws_route53_record.cert_validation : r.fqdn]
}
