variable "vercel_team_slug" {
  description = "Vercel team slug. With Team issuer mode the OIDC issuer is https://oidc.vercel.com/<slug>."
  type        = string
}

variable "vercel_project" {
  description = "Vercel project name, as it appears in the OIDC 'project' claim."
  type        = string
}

variable "oidc_discovery_url" {
  description = "Override for tests (e.g. a local issuer). Defaults to Vercel's team issuer."
  type        = string
  default     = null
}

variable "jwt_validation_pubkeys" {
  description = "Static PEM keys instead of OIDC discovery. Only for the local test harness."
  type        = list(string)
  default     = []
}

variable "kv_mount" {
  type    = string
  default = "secret"
}
