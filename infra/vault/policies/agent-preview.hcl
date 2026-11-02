# Preview agents can read preview secrets. Nothing else.
path "secret/data/preview/*" {
  capabilities = ["read"]
}
