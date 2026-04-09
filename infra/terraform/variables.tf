variable "region" {
  type        = string
  description = "AWS region"
  default     = "eu-central-1"
}

variable "domain" {
  type        = string
  description = "Apex domain. Subdomains patient/doctor/admin/api/livekit will be created under it."
  default     = "testing-core.link"
}

variable "instance_type" {
  type        = string
  description = "EC2 instance type"
  default     = "t3.medium"
}

variable "root_volume_gb" {
  type        = number
  description = "Root EBS volume size in GB. 30 fits node_modules + docker images + postgres data."
  default     = 30
}

variable "ssh_pubkey" {
  type        = string
  description = "SSH public key contents (e.g. cat ~/.ssh/id_ed25519.pub)"
}

variable "ssh_cidr" {
  type        = string
  description = "CIDR allowed to SSH (e.g. 203.0.113.42/32). Use 0.0.0.0/0 only for short-lived demos."
}

variable "repo_url" {
  type        = string
  description = "Git repository URL. Use SSH form for private repos (git@github.com:owner/repo.git)."
}

variable "repo_branch" {
  type        = string
  description = "Branch to deploy"
  default     = "main"
}

variable "git_ssh_private_key" {
  type        = string
  sensitive   = true
  description = <<EOT
Private SSH key contents (e.g. cat ~/.ssh/id_ed25519) used by the EC2
instance to git clone the private repo. Leave empty for public repos.
The matching public key must already be registered in your GitHub
account (the same key you use locally is fine).

Recommended: pass via env var instead of putting in terraform.tfvars:
  export TF_VAR_git_ssh_private_key="$(cat ~/.ssh/id_ed25519)"
EOT
  default     = ""
}

variable "le_email" {
  type        = string
  description = "Email for Let's Encrypt notifications"
}
