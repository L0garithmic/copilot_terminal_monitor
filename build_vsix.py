#!/usr/bin/env python3
"""
Build VSIX package for VS Code Extension
This script automates the process of building and packaging the extension.
"""

import subprocess
import sys
import os
import shutil
import platform
import json
import argparse
from pathlib import Path
from typing import Optional

# Detect Windows and add .cmd extension to commands if needed
IS_WINDOWS = platform.system() == "Windows"
PACKAGE_JSON_PATH = Path(__file__).parent / "package.json"


def get_command(cmd):
    """Get the correct command for the current platform."""
    if IS_WINDOWS and isinstance(cmd, list):
        # Add .cmd extension for npm and vsce on Windows
        if cmd[0] in ["npm", "vsce"]:
            cmd[0] = f"{cmd[0]}.cmd"
    return cmd


def run_command(cmd, description, shell=True):
    """Run a command and handle errors."""
    print(f"\n{'=' * 60}")
    print(f"⚙️  {description}")
    print(f"{'=' * 60}")

    cmd = get_command(cmd)

    try:
        result = subprocess.run(
            cmd,
            shell=shell,
            check=True,
            capture_output=True,
            text=True,
            cwd=Path(__file__).parent,
        )
        if result.stdout:
            print(result.stdout)
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Error: {description} failed")
        print(f"Command: {' '.join(cmd) if isinstance(cmd, list) else cmd}")
        if e.stdout:
            print(f"Output: {e.stdout}")
        if e.stderr:
            print(f"Error: {e.stderr}")
        return False


def check_prerequisites():
    """Check if required tools are installed."""
    print("\n🔍 Checking prerequisites...")

    # Check Node.js
    try:
        result = subprocess.run(
            ["node", "--version"], capture_output=True, text=True, check=True
        )
        print(f"✅ Node.js: {result.stdout.strip()}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ Node.js is not installed or not in PATH")
        return False

    # Check npm (with .cmd extension on Windows)
    npm_cmd = "npm.cmd" if IS_WINDOWS else "npm"
    try:
        result = subprocess.run(
            [npm_cmd, "--version"], capture_output=True, text=True, check=True
        )
        print(f"✅ npm: {result.stdout.strip()}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("❌ npm is not installed or not in PATH")
        return False

    # Check if vsce is installed (with .cmd extension on Windows)
    vsce_cmd = "vsce.cmd" if IS_WINDOWS else "vsce"
    try:
        result = subprocess.run(
            [vsce_cmd, "--version"], capture_output=True, text=True, check=True
        )
        print(f"✅ vsce: {result.stdout.strip()}")
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("⚠️  vsce is not installed. Installing globally...")
        if not run_command(
            ["npm", "install", "-g", "@vscode/vsce"], "Installing vsce", shell=False
        ):
            return False

    return True


def clean_build():
    """Clean previous build artifacts."""
    print("\n🧹 Cleaning build artifacts...")

    # Directories that are safe to remove as build artifacts.
    # Keep this list conservative to avoid deleting developer files.
    dirs_to_clean = [
        "dist",
        "out",
        "node_modules/.cache",
    ]

    for dir_name in dirs_to_clean:
        dir_path = Path(dir_name)
        if dir_path.exists():
            print(f"  Removing {dir_name}/")
            shutil.rmtree(dir_path, ignore_errors=True)

    print("✅ Cleanup complete")
    return True


def get_version():
    """Read version from package.json file."""
    try:
        with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
        version = data.get("version", "0.0.0")
        return str(version).strip() or "0.0.0"
    except FileNotFoundError:
        print("⚠️  package.json file not found, using default version")
        return "0.0.0"
    except (TypeError, ValueError) as exc:  # JSON errors
        print(f"⚠️  Invalid package.json format ({exc}), using default version")
        return "0.0.0"


def prompt_version_update():
    """Optionally bump the extension version before building."""
    if not PACKAGE_JSON_PATH.exists():
        print("\n⚠️  package.json not found, skipping version update prompt")
        return True

    try:
        with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
            package_data = json.load(f)
    except Exception as exc:
        print(f"\n❌ Unable to read package.json: {exc}")
        return False

    version = package_data.get("version")
    if not version:
        print(
            "\n⚠️  package.json is missing a 'version' field, skipping version update prompt"
        )
        return True

    print(f"\n📌 Current version: {version}")
    response = (
        input("Would you like to update the version before building? [Y/n]: ")
        .strip()
        .lower()
    )
    if response in ("n", "no"):
        return True

    try:
        major, minor, patch = [int(part) for part in version.split(".")]
    except ValueError:
        print("⚠️  Unable to parse semantic version. Skipping version update.")
        return True

    # Show what each option will do
    print("\nSelect version increment:")
    print(
        f"  1. Patch (bug fixes):        {major}.{minor}.{patch} → {major}.{minor}.{patch + 1} [default]"
    )
    print(
        f"  2. Minor (new features):     {major}.{minor}.{patch} → {major}.{minor + 1}.0"
    )
    print(f"  3. Major (breaking changes): {major}.{minor}.{patch} → {major + 1}.0.0")

    while True:
        selection = input("\nEnter your choice [1/2/3]: ").strip()
        if selection == "":
            selection = "1"
        if selection in {"1", "2", "3"}:
            break
        print("⚠️  Invalid selection. Please enter 1, 2, or 3 (or press Enter for 1).")

    if selection == "3":
        major += 1
        minor = 0
        patch = 0
    elif selection == "2":
        minor += 1
        patch = 0
    else:
        patch += 1

    new_version = f"{major}.{minor}.{patch}"
    package_data["version"] = new_version

    try:
        with open(PACKAGE_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(package_data, f, indent=2, ensure_ascii=False)
            f.write("\n")
    except Exception as exc:
        print(f"❌ Failed to write updated version to package.json: {exc}")
        return False

    # Update version in README.md
    readme_path = Path(__file__).parent / "README.md"
    try:
        if readme_path.exists():
            with open(readme_path, "r", encoding="utf-8") as f:
                readme_content = f.read()

            # Replace version in the badge: [![Version](https://img.shields.io/badge/version-X.Y.Z-blue.svg)
            import re

            readme_content = re.sub(
                r"(!\[Version\]\(https://img\.shields\.io/badge/version-)[\d.]+(-blue\.svg\))",
                rf"\g<1>{new_version}\g<2>",
                readme_content,
            )

            with open(readme_path, "w", encoding="utf-8") as f:
                f.write(readme_content)
            print(f"✅ README.md version badge updated to {new_version}")
    except Exception as exc:
        print(f"⚠️  Warning: Failed to update version in README.md: {exc}")
        # Don't fail the entire build if README update fails

    print(f"✅ Version updated: {version} → {new_version}")
    return True


def install_dependencies():
    """Install npm dependencies."""
    return run_command(["npm", "install"], "Installing npm dependencies", shell=False)


def compile_typescript():
    """Compile TypeScript code."""
    return run_command(["npm", "run", "compile"], "Compiling TypeScript", shell=False)


def bundle_with_esbuild():
    """Bundle the extension with esbuild so dist/ assets exist for activation."""
    return run_command(
        ["npm", "run", "package"], "Bundling extension with esbuild", shell=False
    )


def run_tests():
    """Run tests if available."""
    # Check if test script exists in package.json
    if PACKAGE_JSON_PATH.exists():
        with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
            package_data = json.load(f)

        scripts = package_data.get("scripts", {})
        if "test" in scripts:
            print("\n🧪 VS Code extension tests require VS Code Test Runner")
            print(
                "⚠️  Skipping tests during VSIX build (tests need VS Code environment)"
            )
            print(
                "💡 To run tests: Use VS Code's Test Explorer or 'npm test' in VS Code terminal"
            )
            return True
        else:
            print("\n⚠️  No test script found in package.json, skipping tests...")
            return True
    else:
        print("\n⚠️  package.json not found, skipping tests...")
        return True


def package_extension(version, extension_name):
    """Package the extension into a VSIX file with version in filename."""
    output_name = f"{extension_name}-{version}.vsix"
    return run_command(
        ["vsce", "package", "-o", output_name, "--allow-missing-repository"],
        f"Packaging extension as {output_name}",
        shell=False,
    )


def prune_vsix_files(keep_latest: int = 2) -> None:
    """Keep only the most recent VSIX files based on modification time."""
    vsix_files = sorted(
        Path(__file__).parent.glob("*.vsix"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )

    for old_file in vsix_files[keep_latest:]:
        try:
            print(f"  Removing older VSIX: {old_file.name}")
            old_file.unlink()
        except OSError as exc:
            print(f"⚠️  Unable to remove {old_file.name}: {exc}")


def find_vsix_file(preferred: Optional[Path] = None):
    """Find the generated VSIX file, prioritising the provided path."""
    if preferred and preferred.exists():
        return preferred

    vsix_files = sorted(
        Path(__file__).parent.glob("*.vsix"),
        key=lambda f: f.stat().st_mtime,
        reverse=True,
    )
    if vsix_files:
        return vsix_files[0]
    return None


def final_cleanup(keep_build: bool) -> None:
    """Remove build artifacts created during the run unless the user requested to keep them."""
    if keep_build:
        print("\nℹ️  Keeping build outputs (per --keep-build)")
        return

    print("\n🧾 Final cleanup: removing temporary build folders...")
    cleanup_dirs = ["dist", "out", "node_modules/.cache"]
    for d in cleanup_dirs:
        p = Path(d)
        if p.exists():
            print(f"  Removing {d}/")
            shutil.rmtree(p, ignore_errors=True)

    print("✅ Final cleanup complete")
    print("   (Development runs will fall back to ts-node when out/ is missing.)")


def get_package_main() -> Optional[str]:
    try:
        with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
            package_data = json.load(f)
        return package_data.get("main")
    except (FileNotFoundError, json.JSONDecodeError):
        return None


def set_package_main(main_path: str) -> bool:
    try:
        with open(PACKAGE_JSON_PATH, "r", encoding="utf-8") as f:
            package_data = json.load(f)
        if package_data.get("main") == main_path:
            return True
        package_data["main"] = main_path
        with open(PACKAGE_JSON_PATH, "w", encoding="utf-8") as f:
            json.dump(package_data, f, indent=2, ensure_ascii=False)
            f.write("\n")
        return True
    except Exception as exc:
        print(f"❌ Failed to update package.json main field: {exc}")
        return False


def get_extension_name():
    """Get the extension name from package.json."""
    package_json_path = Path(__file__).parent / "package.json"
    try:
        with open(package_json_path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return data.get("name", "extension")
    except Exception:
        return "extension"


def main(keep_build: bool = False):
    """Main build process."""
    print("╔═══════════════════════════════════════════════════════════╗")
    print("║      VS Code Extension - VSIX Build Script               ║")
    print("╚═══════════════════════════════════════════════════════════╝")

    # Change to script directory
    script_dir = Path(__file__).parent.resolve()
    os.chdir(script_dir)
    print(f"\n� Working directory: {script_dir}")

    # Get extension name
    extension_name = get_extension_name()

    # Build steps
    success = False
    try:
        # Step 1: Check prerequisites
        if not check_prerequisites():
            print("\n❌ Prerequisites check failed!")
            sys.exit(1)

        # Step 2: Clean previous builds
        if not clean_build():
            print("\n❌ Failed to clean build artifacts!")
            return

        # Step 3: Prompt for version update (optional)
        if not prompt_version_update():
            print("\n❌ Version update failed!")
            return

        # Step 4: Get dev-time entrypoint and version from package.json
        dev_main = get_package_main()
        if not dev_main:
            print(
                "\n⚠️  Unable to determine current package main entry (package.json missing?)"
            )
            return

        version = get_version()
        print(f"\n📌 Building version: {version}\n")

        # Step 5: Install dependencies
        if not install_dependencies():
            print("\n❌ Failed to install dependencies!")
            return

        # Step 6: Compile TypeScript
        if not compile_typescript():
            print("\n❌ TypeScript compilation failed!")
            return

        # Step 7: Run tests
        if not run_tests():
            print("\n❌ Tests failed!")
            return

        # Step 8: Temporarily point package.json to dist build for packaging
        original_main = dev_main
        try:
            if not set_package_main("./dist/extension.js"):
                return

            # Step 9: Bundle with esbuild to produce dist/extension.js
            if not bundle_with_esbuild():
                print("\n❌ Esbuild bundling failed!")
                return

            # Step 10: Package extension
            expected_vsix = Path(f"{extension_name}-{version}.vsix")
            if not package_extension(version, extension_name):
                print("\n❌ Extension packaging failed!")
                return
        finally:
            set_package_main(original_main or "./out/extension.js")

        prune_vsix_files(keep_latest=2)

        success = True

        # Step 11: Report success
        vsix_file = find_vsix_file(preferred=expected_vsix)
        if vsix_file:
            size_mb = vsix_file.stat().st_size / (1024 * 1024)
            print("\n" + "=" * 60)
            print("✨ BUILD SUCCESSFUL!")
            print("=" * 60)
            print("\n📦 VSIX package created:")
            print(f"  📄 {vsix_file.name} ({size_mb:.2f} MB)")
            print(f"📍 Location: {vsix_file.absolute()}")
            print("\n💡 Next steps:")
            print("  1. Test the VSIX: Install it in VS Code")
            print(f"     code --install-extension {vsix_file.name}")
            print("  2. Publish to marketplace:")
            print("     vsce publish")
            print()
        else:
            print("\n⚠️  Build completed but VSIX file not found!")
            success = False
    finally:
        # Always attempt final cleanup unless the user asked to keep the build folder.
        try:
            final_cleanup(keep_build)
        except Exception as e:
            print(f"⚠️  Final cleanup encountered an issue (non-fatal): {e}")

    if not success:
        sys.exit(1)


if __name__ == "__main__":
    try:
        parser = argparse.ArgumentParser(
            description="Build and package the VS Code extension."
        )
        parser.add_argument(
            "--keep-build",
            dest="keep_build",
            action="store_true",
            help="Do not remove the generated build directories (out/, dist/) after the build.",
        )
        args = parser.parse_args()
        main(keep_build=args.keep_build)
    except KeyboardInterrupt:
        print("\n\n⚠️  Build cancelled by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        import traceback

        traceback.print_exc()
        sys.exit(1)
