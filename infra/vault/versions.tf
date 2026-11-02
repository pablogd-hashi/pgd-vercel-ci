terraform {
  required_version = ">= 1.6"
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

# Reads VAULT_ADDR, VAULT_TOKEN and VAULT_NAMESPACE (admin on HCP Vault).
provider "vault" {}
