# Preview agents can read preview secrets. Nothing else.
path "${kv_mount}/data/preview/*" {
  capabilities = ["read"]
}
