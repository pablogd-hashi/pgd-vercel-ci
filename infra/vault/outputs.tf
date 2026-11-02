output "auth_mount" {
  value = vault_jwt_auth_backend.vercel.path
}

output "issuer" {
  value = local.issuer
}
