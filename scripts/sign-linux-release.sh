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
# electron-builder 按目标格式使用不同的架构名；按实际产物命名签名。
# 修复依据：electron-builder 的 getArtifactArchName 只把 x64 的 AppImage/rpm/flatpak 映射为
# x86_64、deb/snap 映射为 amd64，x64 的 pacman 保持默认 x64；arm64 才把 rpm/pacman 映射为
# aarch64。预验收曾因把 x64 的 pacman 预期成 x86_64 而在签名步骤报 Missing artifact。
appimage_arch=x86_64
deb_arch=amd64
rpm_arch=x86_64
pacman_arch=x64
if [[ "$arch" == arm64 ]]; then
  appimage_arch=arm64
  deb_arch=arm64
  rpm_arch=aarch64
  pacman_arch=aarch64
fi
for ext in AppImage deb rpm pkg.tar.zst; do
  case "$ext" in
    AppImage) file_arch=$appimage_arch ;;
    deb) file_arch=$deb_arch ;;
    rpm) file_arch=$rpm_arch ;;
    *) file_arch=$pacman_arch ;;
  esac
  file="KayingCode-$version-linux-$file_arch.$ext"
  [[ -f "$file" ]] || { echo "Missing artifact: $file" >&2; exit 1; }
  files+=("$file")
done
manifest="SHA256SUMS-linux-$arch"
if command -v sha256sum >/dev/null; then sha256sum "${files[@]}" > "$manifest"; else shasum -a 256 "${files[@]}" > "$manifest"; fi
gpg --homedir "$signing_home" --batch --yes --pinentry-mode loopback --passphrase-file "$signing_home/passphrase" --local-user "$private_fingerprint" --armor --detach-sign --output "$manifest.asc" "$manifest"
gpgv --keyring "$signing_home/public.gpg" "$manifest.asc" "$manifest"
cp "$public_key" "KayingCode-linux-release-public-key.asc"
