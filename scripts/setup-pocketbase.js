#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execSync, execFileSync } = require('child_process');

const POCKETBASE_VERSION = '0.35.0'; // Latest stable version as of 2024

// Where a generated superuser credential is kept. Inside pb_data on purpose:
// it only describes that database, so `rm -rf pocketbase/pb_data` takes the
// credential with the account it belongs to, and pb_data is already gitignored.
const SUPERUSER_ENV_FILENAME = '.pb_superuser.env';
// NOT admin@localhost: PocketBase's email validator rejects a single-label
// domain, and `superuser upsert` reports that failure while still exiting 0.
const GENERATED_ADMIN_EMAIL = 'admin@inventory-ware.local';
// The placeholder pair shipped in .env.example and docker/README.md. Honouring
// it would create a superuser whose password is published in this repository.
const PLACEHOLDER_ADMIN_EMAIL = 'admin@example.com';
const PLACEHOLDER_ADMIN_PASSWORD = 'your-secure-password';
const UPSERT_SUCCESS = 'Successfully saved superuser';
const PLATFORM_MAP = {
  'darwin': 'darwin',
  'linux': 'linux',
  'win32': 'windows'
};

const ARCH_MAP = {
  'x64': 'amd64',
  'arm64': 'arm64'
};

function getPlatformInfo() {
  const platform = PLATFORM_MAP[process.platform];
  const arch = ARCH_MAP[process.arch];

  if (!platform || !arch) {
    throw new Error(`Unsupported platform: ${process.platform} ${process.arch}`);
  }

  return { platform, arch };
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`Downloading ${url}...`);

    const file = fs.createWriteStream(dest);

    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Handle redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => { }); // Delete the file on error
        reject(err);
      });
    }).on('error', reject);
  });
}

async function setupPocketBase() {
  try {
    const { platform, arch } = getPlatformInfo();
    const pbDir = path.join(__dirname, '..', 'pocketbase');

    // Create pb directory if it doesn't exist
    if (!fs.existsSync(pbDir)) {
      fs.mkdirSync(pbDir, { recursive: true });
    }

    // Determine file extension and executable name
    const isWindows = platform === 'windows';
    const extension = isWindows ? '.zip' : '.zip';
    const executableName = isWindows ? 'pocketbase.exe' : 'pocketbase';

    // Construct download URL
    const filename = `pocketbase_${POCKETBASE_VERSION}_${platform}_${arch}${extension}`;
    const downloadUrl = `https://github.com/pocketbase/pocketbase/releases/download/v${POCKETBASE_VERSION}/${filename}`;
    const zipPath = path.join(pbDir, filename);
    const executablePath = path.join(pbDir, executableName);

    // Check if PocketBase is already installed
    if (fs.existsSync(executablePath)) {
      console.log('✅ PocketBase is already installed');

      // Check version
      try {
        const version = execSync(`cd ${pbDir} && ./${executableName} --version`, { encoding: 'utf8' });
        console.log(`Current version: ${version.trim()}`);
        return;
      } catch (err) {
        console.log('⚠️  Existing PocketBase binary seems corrupted, re-downloading...');
      }
    }

    console.log(`📦 Setting up PocketBase v${POCKETBASE_VERSION} for ${platform}/${arch}...`);

    // Download PocketBase
    await downloadFile(downloadUrl, zipPath);
    console.log('✅ Download completed');

    // Extract the zip file
    console.log('📂 Extracting PocketBase...');

    if (process.platform === 'win32') {
      // Use PowerShell on Windows
      execSync(`powershell -command "Expand-Archive -Path '${zipPath}' -DestinationPath '${pbDir}' -Force"`, { stdio: 'inherit' });
    } else {
      // Use unzip on Unix-like systems
      execSync(`cd "${pbDir}" && unzip -o "${filename}"`, { stdio: 'inherit' });
    }

    // Make executable on Unix-like systems
    if (!isWindows) {
      execSync(`chmod +x "${executablePath}"`);
    }

    // Clean up zip file
    fs.unlinkSync(zipPath);

    console.log('✅ PocketBase setup completed!');
    console.log(`📍 PocketBase binary location: ${executablePath}`);

  } catch (error) {
    console.error('❌ Error setting up PocketBase:', error.message);
    process.exit(1);
  }
}

// Create initial PocketBase configuration
function createInitialConfig() {
  const pbDir = path.join(__dirname, '..', 'pocketbase');
  const configPath = path.join(pbDir, 'pb_hooks');

  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(configPath, { recursive: true });

    // Create a sample hook file
    const sampleHook = `// Sample PocketBase hook
// Place your JavaScript hooks here
// Documentation: https://pocketbase.io/docs/js-overview/

// Example: Log all record operations
onRecordAfterCreateRequest((e) => {
  console.log("Record created:", e.record.id, e.record.tableName())
})

onRecordAfterUpdateRequest((e) => {
  console.log("Record updated:", e.record.id, e.record.tableName())
})

onRecordAfterDeleteRequest((e) => {
  console.log("Record deleted:", e.record.id, e.record.tableName())
})
`;

    fs.writeFileSync(path.join(configPath, 'main.pb.js'), sampleHook);
    console.log('📝 Created sample PocketBase hooks');
  }
}

// 32 alphanumeric characters. Alphanumeric on purpose: the value gets pasted
// into shells, .env files and URLs by whoever reads it back out of the
// credentials file, and a quoting mistake in a generated password is a silent
// lockout. randomInt rather than randomBytes[i] % 62 - 256 is not a multiple of
// 62, so the modulo would bias the first eight letters of the alphabet.
function randomSecret() {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 32; i++) {
    out += alphabet[crypto.randomInt(alphabet.length)];
  }
  return out;
}

// Reads one KEY=value pair out of the credentials file. Parsed, never
// evaluated, and symmetric with read_env_value() in docker/pb-superuser.sh.
function readEnvValue(contents, key) {
  for (const line of contents.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith(`${key}=`)) continue;
    const value = trimmed.slice(key.length + 1).trim();
    const quoted = /^'(.*)'$/.exec(value) || /^"(.*)"$/.exec(value);
    return quoted ? quoted[1] : value;
  }
  return '';
}

// Ensure a PocketBase superuser exists, generating one when none was supplied.
// Without it a clean checkout leaves PocketBase printing its first-run
// installer link and the admin UI unreachable until someone runs
// `pocketbase superuser upsert` by hand. Mirrors docker/pb-superuser.sh.
function createSuperUser() {
  const pbDir = path.join(__dirname, '..', 'pocketbase');
  const isWindows = process.platform === 'win32';
  const executableName = isWindows ? 'pocketbase.exe' : 'pocketbase';
  const executablePath = path.join(pbDir, executableName);
  const pbDataDir = path.join(pbDir, 'pb_data');
  const superuserEnvPath = path.join(pbDataDir, SUPERUSER_ENV_FILENAME);

  if (!fs.existsSync(executablePath)) {
    console.log('⚠️  Skipping superuser creation: PocketBase binary not found');
    return;
  }

  let email = process.env.POCKETBASE_ADMIN_EMAIL;
  let password = process.env.POCKETBASE_ADMIN_PASSWORD;

  // Both are cleared together: clearing only the password would send a setup
  // that used the documented pair into the "exactly one set" error below.
  if (password === PLACEHOLDER_ADMIN_PASSWORD) {
    console.log(`⚠️  Ignoring the placeholder POCKETBASE_ADMIN_EMAIL/PASSWORD pair (${PLACEHOLDER_ADMIN_EMAIL} / ${PLACEHOLDER_ADMIN_PASSWORD}) - a credential will be generated instead. Set both to real values in .env to manage the account yourself.`);
    email = '';
    password = '';
  }

  let generated = false;

  if (email && password) {
    console.log(`👤 Using the superuser credentials from the environment: ${email}`);
  } else if (email || password) {
    // Exactly one set is a typo, not an intention. Guessing the other half
    // would either invent a credential or ignore the one that was given.
    console.error('❌ Set both POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD, or neither - leaving both unset generates a superuser.');
    process.exitCode = 1;
    return;
  } else if (fs.existsSync(superuserEnvPath)) {
    // Reuse what an earlier run generated, so `yarn setup` does not rotate the
    // password out from under someone who wrote it down.
    const contents = fs.readFileSync(superuserEnvPath, 'utf8');
    email = readEnvValue(contents, 'POCKETBASE_ADMIN_EMAIL');
    password = readEnvValue(contents, 'POCKETBASE_ADMIN_PASSWORD');
    if (!email || !password) {
      console.error(`❌ ${superuserEnvPath} does not contain both POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD. Delete it to regenerate, or set both in .env.`);
      process.exitCode = 1;
      return;
    }
    console.log(`👤 Reusing the generated superuser credentials in ${superuserEnvPath}`);
  } else {
    email = GENERATED_ADMIN_EMAIL;
    password = randomSecret();
    generated = true;
    // PocketBase creates pb_data itself on first run, so it may not exist yet.
    fs.mkdirSync(pbDataDir, { recursive: true });
    fs.writeFileSync(
      superuserEnvPath,
      `# Generated by scripts/setup-pocketbase.js because neither\n` +
      `# POCKETBASE_ADMIN_EMAIL nor POCKETBASE_ADMIN_PASSWORD was set. Delete this\n` +
      `# file to have a new credential pair generated, or set both in .env to\n` +
      `# manage the account yourself - this file is then ignored.\n` +
      `POCKETBASE_ADMIN_EMAIL='${email}'\n` +
      `POCKETBASE_ADMIN_PASSWORD='${password}'\n`,
      // Largely a no-op on Windows/NTFS, hence no "0600" claim in the log there.
      { mode: 0o600 }
    );
  }

  // execFileSync, not execSync: an operator-supplied password containing a
  // quote, $ or ; would otherwise break or inject into the shell string. The
  // output is captured because the exit status alone does not prove anything -
  // `superuser upsert` exits 0 even when PocketBase's validator refuses the
  // account. --hooksDir matters too: a migration that `require`s a module
  // resolves it against the hooks directory, and a failure there defers the app
  // schema to `serve`, whose snapshot can wipe the superuser just created.
  let output = '';
  let failed = false;
  try {
    output = execFileSync(
      executablePath,
      [
        'superuser', 'upsert', email, password,
        `--dir=${pbDataDir}`,
        `--hooksDir=${path.join(pbDir, 'pb_hooks')}`,
        `--migrationsDir=${path.join(pbDir, 'pb_migrations')}`,
      ],
      { cwd: pbDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
    );
  } catch (error) {
    failed = true;
    output = `${error.stdout || ''}${error.stderr || ''}` || error.message;
  }

  if (!failed && output.includes(UPSERT_SUCCESS)) {
    if (generated) {
      console.log(`✅ Generated a PocketBase superuser: ${email}`);
      console.log(`   password: ${password}`);
      console.log(`   saved to ${superuserEnvPath}${isWindows ? '' : ' (mode 0600)'}`);
    } else {
      console.log(`✅ PocketBase superuser ${email} is ready`);
    }
    return;
  }

  console.error(`❌ Could not create the PocketBase superuser ${email} - PocketBase will fall back to printing a first-run installer link.`);
  if (output.trim()) {
    console.error(output.trim());
  }
  process.exitCode = 1;
}

if (require.main === module) {
  setupPocketBase().then(() => {
    createInitialConfig();
    createSuperUser();
  });
}

module.exports = { setupPocketBase, createSuperUser };