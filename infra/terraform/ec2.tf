data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }
}

resource "aws_key_pair" "deploy" {
  key_name   = "telemed-demo"
  public_key = var.ssh_pubkey
}

# Allocate the EIP first so we can pass its address into user_data via templatefile.
# Without this LiveKit can't be told its public IP at boot.
resource "aws_eip" "app" {
  domain = "vpc"

  tags = {
    Name = "telemed-demo"
  }
}

resource "aws_instance" "app" {
  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = aws_key_pair.deploy.key_name
  vpc_security_group_ids = [aws_security_group.app.id]
  subnet_id              = data.aws_subnets.default.ids[0]

  root_block_device {
    volume_size           = var.root_volume_gb
    volume_type           = "gp3"
    delete_on_termination = true
    encrypted             = true
  }

  user_data = templatefile("${path.module}/user_data.sh.tpl", {
    domain              = var.domain
    repo_url            = var.repo_url
    repo_branch         = var.repo_branch
    le_email            = var.le_email
    public_ip           = aws_eip.app.public_ip
    git_ssh_private_key = var.git_ssh_private_key
  })

  # Force re-bootstrap if the script changes (helpful while iterating).
  user_data_replace_on_change = true

  tags = {
    Name = "telemed-demo"
  }

  depends_on = [aws_eip.app]
}

resource "aws_eip_association" "app" {
  instance_id   = aws_instance.app.id
  allocation_id = aws_eip.app.id
}
