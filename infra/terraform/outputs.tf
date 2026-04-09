output "public_ip" {
  description = "Elastic IP attached to the instance (used for SSH and direct LiveKit UDP)"
  value       = aws_eip.app.public_ip
}

output "alb_dns_name" {
  description = "ALB DNS name (Route 53 aliases the subdomains here)"
  value       = aws_lb.app.dns_name
}

output "acm_certificate_arn" {
  description = "ARN of the wildcard ACM certificate attached to the ALB"
  value       = aws_acm_certificate_validation.wildcard.certificate_arn
}

output "ns_records" {
  description = "Nameservers to set at the registrar of testing-core.link"
  value       = aws_route53_zone.main.name_servers
}

output "ssh_command" {
  description = "SSH into the instance"
  value       = "ssh ubuntu@${aws_eip.app.public_ip}"
}

output "bootstrap_log" {
  description = "Tail the bootstrap log to watch user_data progress"
  value       = "ssh ubuntu@${aws_eip.app.public_ip} 'sudo tail -f /var/log/telemed-bootstrap.log'"
}

output "urls" {
  description = "Demo URLs"
  value = {
    patient = "https://patient.${var.domain}"
    doctor  = "https://doctor.${var.domain}"
    admin   = "https://admin.${var.domain}"
    api     = "https://api.${var.domain}/api/v1/docs"
  }
}
