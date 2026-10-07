# dev/placeholders

Scratch images used only to preview the theme on a local Halo instance.

Nothing in here ever reaches a release. `theme-package` builds the zip from
`templates/`, `theme.yaml`, `settings.yaml`, `LICENSE` and `README.md` only, so
this folder is excluded by construction rather than by an ignore rule.

The files themselves are gitignored (see `.gitignore`); this README is not, so
the folder survives a clone.

## How they get into the preview

They are **not** referenced by any template. Upload one to the local Halo
instance and point the theme settings at the resulting `/upload/...` URL:

```bash
curl -s -b cookies.txt -X POST \
  "http://localhost:8090/apis/api.console.halo.run/v1alpha1/attachments/upload" \
  -F "file=@dev/placeholders/testonly.webp;type=image/webp" \
  -F "policyName=default-policy"
```

Or just drag it into **Console → 附件** and pick it in **Console → 主题 → 设置 → Hero**.
