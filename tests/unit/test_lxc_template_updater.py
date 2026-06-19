from pathlib import Path


def _workflow_text() -> str:
    root = Path(__file__).resolve().parents[2]
    return (root / ".github" / "workflows" / "lxc-template.yml").read_text(encoding="utf-8")


def test_updater_uses_release_bundle_filename_for_download_and_extract():
    workflow = _workflow_text()

    assert 'BUNDLE_FILENAME=$(basename "$BUNDLE_URL")' in workflow
    assert 'curl -fL "$BUNDLE_URL" -o "$TMP/$BUNDLE_FILENAME"' in workflow
    assert 'tar -xzf "$TMP/$BUNDLE_FILENAME" -C "$INSTALL_DIR"' in workflow
    assert '"$TMP/app-bundle.tar.gz"' not in workflow


def test_updater_verifies_checksum_against_downloaded_filenames():
    workflow = _workflow_text()

    # SHA-256 is parsed from the release notes body — no separate checksum asset needed
    assert "EXPECTED_SHA256" in workflow
    assert "sha256sum -c -" in workflow
    # Old sha512 approach must be gone
    assert "CHECKSUM_URL" not in workflow
    assert "sha512sum" not in workflow
