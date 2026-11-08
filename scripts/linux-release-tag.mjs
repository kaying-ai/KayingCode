export function resolveLinuxReleaseTag(version, commit, ref) {
  if (
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:[.-][0-9A-Za-z.-]+)?$/u.test(version) ||
    !/^[0-9a-f]{40}$/u.test(commit)
  ) {
    throw new Error("Invalid release version or commit SHA");
  }
  if (ref === `refs/tags/kaying-code-v${version}`) return "release";
  if (ref === `refs/tags/kaying-code-preflight-v${version}-${commit.slice(0, 12)}`)
    return "preflight";
  throw new Error("Expected the release tag or a preflight tag bound to this exact commit");
}
