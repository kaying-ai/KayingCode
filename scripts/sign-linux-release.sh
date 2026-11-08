#!/usr/bin/env bash
set -euo pipefail
artifact_dir=$1
version=$2
arch=$3
public_key=$4
: "${LINUX_GPG_PRIVATE_KEY:?Missing Linux signing private key}"
: "${LINUX_GPG_PASSPHRASE:?Missing Linux signing passphrase}"
[[ "$arch" == x64 || "$arch" == arm64 ]]
[[ "$version" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]
public_key=$(cd "$(dirname "$public_key")" && pwd)/$(basename "$public_key")
umask 077
signing_home=$(mktemp -d /tmp/kaying-gpg.XXXXXXXX)
trap 'gpgconf --homedir "$signing_home" --kill gpg-agent >/dev/null 2>&1 || true; rm -rf "$signing_home"' EXIT
printf '%s' "$LINUX_GPG_PASSPHRASE" > "$signing_home/passphrase"
printf '%s' "$LINUX_GPG_PRIVATE_KEY" | gpg --homedir "$signing_home" --batch --quiet --import
unset LINUX_GPG_PRIVATE_KEY LINUX_GPG_PASSPHRASE
private_fingerprint=$(gpg --homedir "$signing_home" --batch --with-colons --list-secret-keys | awk -F: '$1 == "fpr" {print $10; exit}')
public_fingerprint=$(gpg --batch --with-colons --import-options show-only --import "$public_key" | awk -F: '$1 == "fpr" {print $10; exit}')
[[ -n "$private_fingerprint" && "$private_fingerprint" == "$public_fingerprint" ]]
gpg --batch --yes --dearmor --output "$signing_home/public.gpg" "$public_key"
cd "$artifact_dir"
files=()
# electron-builder 对 RPM / pacman 使用发行版架构名；按实际产物命名签名。
package_arch=x86_64
[[ "$arch" == arm64 ]] && package_arch=aarch64
for ext in AppImage deb rpm pkg.tar.zst; do
  file_arch=$arch
  # x64 的 AppImage / deb 也使用各格式对应的架构命名。
  if [[ "$arch" == x64 && "$ext" == AppImage ]]; then file_arch=x86_64; fi
  if [[ "$arch" == x64 && "$ext" == deb ]]; then file_arch=amd64; fi
  if [[ "$ext" == rpm || "$ext" == pkg.tar.zst ]]; then file_arch=$package_arch; fi
  file="KayingCode-$version-linux-$file_arch.$ext"
  [[ -f "$file" ]] || { echo "Missing artifact: $file" >&2; exit 1; }
  files+=("$file")
done
manifest="SHA256SUMS-linux-$arch"
if command -v sha256sum >/dev/null; then sha256sum "${files[@]}" > "$manifest"; else shasum -a 256 "${files[@]}" > "$manifest"; fi
gpg --homedir "$signing_home" --batch --yes --pinentry-mode loopback --passphrase-file "$signing_home/passphrase" --local-user "$private_fingerprint" --armor --detach-sign --output "$manifest.asc" "$manifest"
gpgv --keyring "$signing_home/public.gpg" "$manifest.asc" "$manifest"
cp "$public_key" "KayingCode-linux-release-public-key.asc"
