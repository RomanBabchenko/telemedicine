resource "aws_lb" "app" {
  name               = "telemed-demo-alb"
  load_balancer_type = "application"
  internal           = false
  security_groups    = [aws_security_group.alb.id]
  subnets            = data.aws_subnets.default.ids

  idle_timeout = 4000 # long timeout for LiveKit WebSockets

  tags = {
    Name = "telemed-demo-alb"
  }
}

resource "aws_lb_target_group" "app" {
  name     = "telemed-demo-tg"
  port     = 80
  protocol = "HTTP"
  vpc_id   = data.aws_vpc.default.id

  health_check {
    enabled             = true
    path                = "/health"
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  deregistration_delay = 30

  # Sticky for WebSocket sessions on LiveKit subdomain. ALB stickiness
  # uses cookies, which is fine for both static frontends and the API.
  stickiness {
    type            = "lb_cookie"
    cookie_duration = 86400
    enabled         = true
  }

  tags = {
    Name = "telemed-demo-tg"
  }
}

resource "aws_lb_target_group_attachment" "app" {
  target_group_arn = aws_lb_target_group.app.arn
  target_id        = aws_instance.app.id
  port             = 80
}

# 80 → 443 redirect (no plain HTTP backend leak)
resource "aws_lb_listener" "http_redirect" {
  load_balancer_arn = aws_lb.app.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "redirect"
    redirect {
      port        = "443"
      protocol    = "HTTPS"
      status_code = "HTTP_301"
    }
  }
}

# 443 → forward to nginx on the EC2 instance
resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.app.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = aws_acm_certificate_validation.wildcard.certificate_arn

  default_action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }
}

# Admin IP allowlist. Two rules layered on top of the default forward:
#   - priority 100: host=admin AND source-ip IN allowed → forward to TG
#   - priority 110: host=admin (anything else)          → 403
# Both `count` on length(admin_allowed_cidrs); an empty list keeps the
# legacy behaviour where admin is reachable from any IP. Source-IP is
# the real client IP — ALB sees it directly since it terminates TLS.
resource "aws_lb_listener_rule" "admin_allow" {
  count        = length(var.admin_allowed_cidrs) > 0 ? 1 : 0
  listener_arn = aws_lb_listener.https.arn
  priority     = 100

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.app.arn
  }

  condition {
    host_header {
      values = ["admin.${var.domain}"]
    }
  }

  condition {
    source_ip {
      values = var.admin_allowed_cidrs
    }
  }
}

resource "aws_lb_listener_rule" "admin_deny" {
  count        = length(var.admin_allowed_cidrs) > 0 ? 1 : 0
  listener_arn = aws_lb_listener.https.arn
  priority     = 110

  action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "Admin access from this IP is not allowed."
      status_code  = "403"
    }
  }

  condition {
    host_header {
      values = ["admin.${var.domain}"]
    }
  }
}
