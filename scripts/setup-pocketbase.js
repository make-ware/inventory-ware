#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');

const POCKETBASE_VERSION = '0.35.0'; // Latest stable version as of 2024
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

// Create superuser using environment variables
function createSuperUser() {
  const pbDir = path.join(__dirname, '..', 'pocketbase');
  const isWindows = process.platform === 'win32';
  const executableName = isWindows ? 'pocketbase.exe' : 'pocketbase';
  const executablePath = path.join(pbDir, executableName);

  const email = process.env.POCKETBASE_ADMIN_EMAIL;
  const password = process.env.POCKETBASE_ADMIN_PASSWORD;

  if (!email || !password) {
    console.log('⚠️  Skipping superuser creation: POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD environment variables are required');
    return;
  }

  if (!fs.existsSync(executablePath)) {
    console.log('⚠️  Skipping superuser creation: PocketBase binary not found');
    return;
  }

  console.log(`👤 Creating superuser with email: ${email}...`);

  try {
    execSync(`"${executablePath}" superuser upsert "${email}" "${password}"`, {
      cwd: pbDir,
      stdio: 'inherit'
    });
    console.log('✅ Superuser created successfully!');
  } catch (error) {
    // The command may fail if the superuser already exists, which is fine
    if (error.message && error.message.includes('already exists')) {
      console.log('ℹ️  Superuser already exists');
    } else {
      console.log('⚠️  Superuser creation failed (may already exist):', error.message);
    }
  }
}

if (require.main === module) {
  setupPocketBase().then(() => {
    createInitialConfig();
    createSuperUser();
  });
}

module.exports = { setupPocketBase, createSuperUser };