# ALB security group: public-facing for HTTP/HTTPS only.
resource "aws_security_group" "alb" {
  name        = "telemed-demo-alb"
  description = "Public HTTP/HTTPS for the ALB"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "HTTP"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "telemed-demo-alb"
  }
}

# Application security group: SSH from operator, HTTP only from ALB,
# LiveKit RTP from anywhere (UDP can't go through ALB).
resource "aws_security_group" "app" {
  name        = "telemed-demo-app"
  description = "EC2 instance: SSH, ALB HTTP, LiveKit UDP"
  vpc_id      = data.aws_vpc.default.id

  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = [var.ssh_cidr]
  }

  # nginx listens on :80 only — TLS is terminated by ALB.
  ingress {
    description     = "HTTP from ALB"
    from_port       = 80
    to_port         = 80
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  # LiveKit RTP/RTCP — direct to EC2 EIP, ALB doesn't speak UDP.
  ingress {
    description = "LiveKit RTP"
    from_port   = 50000
    to_port     = 50100
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name = "telemed-demo-app"
  }
}
