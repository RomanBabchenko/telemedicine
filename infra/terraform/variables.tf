variable "region" {
  type        = string
  description = "AWS region"
  default     = "eu-central-1"
}

variable "domain" {
  type        = string
  description = "Domain under which subdomains patient/doctor/admin/api/livekit (plus per-clinic wildcards *.patient/*.doctor/*.admin) are created. The Route 53 hosted zone for this domain must already exist (referenced via route53_zone_id)."
  default     = "medview.com.ua"
}

variable "route53_zone_id" {
  type        = string
  description = "ID of an existing Route 53 hosted zone whose name matches var.domain. We do NOT create the zone — we add records into it."
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

variable "admin_allowed_cidrs" {
  type        = list(string)
  description = <<EOT
IP allowlist (CIDR list) for the admin SPA at admin.<domain>. When the
list is non-empty, the ALB returns 403 to anyone outside these CIDRs
hitting that host; an empty list keeps admin reachable from anywhere
(legacy behaviour). Patient / doctor / api / livekit hosts are
unaffected. Example: ["203.0.113.42/32", "198.51.100.0/24"].
EOT
  default     = []
}

# Platform-wide login kill switches. Map directly to the API's
# AUTH_DISABLE_LOGIN_DOCTOR / AUTH_DISABLE_LOGIN_PATIENT env vars
# (see apps/api/src/config/env.schema.ts). When true, the matching
# role can't use email+password / OTP / magic-link / self-register —
# only invite links from the MIS work. Admin/internal roles bypass
# the gate inside the service so an operator can't lock themselves
# out. Flipping these requires a re-apply because user_data is
# templated; for a hot toggle, edit /home/ubuntu/telemedicine/.env
# on the box and `systemctl restart telemed-api` instead.
variable "auth_disable_login_doctor" {
  type        = bool
  description = "Disable full doctor login (invite links still work). See apps/api/.../env.schema.ts AUTH_DISABLE_LOGIN_DOCTOR."
  default     = false
}

variable "auth_disable_login_patient" {
  type        = bool
  description = "Disable full patient login (invite links still work). See apps/api/.../env.schema.ts AUTH_DISABLE_LOGIN_PATIENT."
  default     = false
}

variable "seed_mode" {
  type        = string
  description = "Database seed on first boot: 'minimal' (platform tenant + super admin only — production) or 'demo' (full demo clinics/doctors/patients)."
  default     = "minimal"

  validation {
    condition     = contains(["minimal", "demo"], var.seed_mode)
    error_message = "seed_mode must be 'minimal' or 'demo'."
  }
}
