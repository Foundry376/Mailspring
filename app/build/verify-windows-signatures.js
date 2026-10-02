/* eslint no-console:0 */
/**
 * Fails the build if any binary inside the Windows artifacts is unsigned.
 *
 * Squirrel generates Update.exe, squirrel.exe and mailspring_ExecutionStub.exe
 * while building the installer, so neither signing step in the workflow sees
 * them. An unsigned stub is what Smart App Control blocks, and it is invisible
 * from the outside: MailspringSetup.exe still verifies fine.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// An unsigned PE has no certificate table. Its data directory entry holds a file
// offset rather than an RVA, so there is nothing to map through the sections.
function hasCertificateTable(buffer) {
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) return false;

  const peOffset = buffer.readUInt32LE(0x3c);
  if (peOffset + 24 > buffer.length || buffer.readUInt32LE(peOffset) !== 0x00004550) return false;

  const optionalHeader = peOffset + 24;
  const magic = buffer.readUInt16LE(optionalHeader);
  const dataDirectory = optionalHeader + (magic === 0x20b ? 112 : 96);
  const directoryCount = buffer.readUInt32LE(optionalHeader + (magic === 0x20b ? 108 : 92));
  if (directoryCount < 5) return false;

  const certificateTable = dataDirectory + 4 * 8;
  return buffer.readUInt32LE(certificateTable + 4) > 0;
}

function isPortableExecutable(buffer) {
  if (buffer.length < 0x40 || buffer.readUInt16LE(0) !== 0x5a4d) return false;
  const peOffset = buffer.readUInt32LE(0x3c);
  return peOffset + 4 <= buffer.length && buffer.readUInt32LE(peOffset) === 0x00004550;
}

function readSections(buffer) {
  const peOffset = buffer.readUInt32LE(0x3c);
  const sectionCount = buffer.readUInt16LE(peOffset + 6);
  const sectionStart = peOffset + 24 + buffer.readUInt16LE(peOffset + 20);

  const sections = [];
  for (let i = 0; i < sectionCount; i++) {
    const header = sectionStart + i * 40;
    sections.push({
      virtualAddress: buffer.readUInt32LE(header + 12),
      rawSize: buffer.readUInt32LE(header + 16),
      rawOffset: buffer.readUInt32LE(header + 20),
    });
  }
  return sections;
}

function rvaToOffset(sections, rva) {
  const section = sections.find(
    (s) => rva >= s.virtualAddress && rva < s.virtualAddress + s.rawSize
  );
  return section ? rva - section.virtualAddress + section.rawOffset : null;
}

// Squirrel keeps the payload the installer unpacks -- Update.exe, the nupkg,
// RELEASES -- in a PE resource rather than appended to the file.
function findEmbeddedZip(buffer) {
  const peOffset = buffer.readUInt32LE(0x3c);
  const optionalHeader = peOffset + 24;
  const magic = buffer.readUInt16LE(optionalHeader);
  const dataDirectory = optionalHeader + (magic === 0x20b ? 112 : 96);
  const resourceRva = buffer.readUInt32LE(dataDirectory + 2 * 8);
  if (!resourceRva) return null;

  const sections = readSections(buffer);
  const resourceRoot = rvaToOffset(sections, resourceRva);
  if (resourceRoot === null) return null;

  const leaves = [];
  const walk = (tableOffset, depth) => {
    if (depth > 3 || tableOffset + 16 > buffer.length) return;
    const named = buffer.readUInt16LE(tableOffset + 12);
    const ids = buffer.readUInt16LE(tableOffset + 14);
    for (let i = 0; i < named + ids; i++) {
      const entry = tableOffset + 16 + i * 8;
      if (entry + 8 > buffer.length) return;
      const offset = buffer.readUInt32LE(entry + 4);
      if (offset & 0x80000000) {
        walk(resourceRoot + (offset & 0x7fffffff), depth + 1);
      } else {
        const dataEntry = resourceRoot + offset;
        if (dataEntry + 8 > buffer.length) continue;
        const start = rvaToOffset(sections, buffer.readUInt32LE(dataEntry));
        const size = buffer.readUInt32LE(dataEntry + 4);
        if (start !== null) leaves.push({ start, size });
      }
    }
  };
  walk(resourceRoot, 0);

  const zip = leaves.find(
    (leaf) => leaf.size > 4 && buffer.readUInt32LE(leaf.start) === 0x04034b50
  );
  return zip ? buffer.subarray(zip.start, zip.start + zip.size) : null;
}

const EOCD_SIGNATURE = 0x06054b50;

function readCentralDirectory(zip) {
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 0xffff; i--) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('not a zip archive');

  let count = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  if (offset === 0xffffffff || count === 0xffff) {
    const locator = eocd - 20;
    if (locator < 0 || zip.readUInt32LE(locator) !== 0x07064b50) {
      throw new Error('zip64 archive without a locator');
    }
    const zip64 = Number(zip.readBigUInt64LE(locator + 8));
    count = Number(zip.readBigUInt64LE(zip64 + 32));
    offset = Number(zip.readBigUInt64LE(zip64 + 48));
  }

  const entries = [];
  let cursor = offset;
  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    entries.push({
      name: zip.toString('utf8', cursor + 46, cursor + 46 + nameLength),
      method: zip.readUInt16LE(cursor + 10),
      localHeader: zip.readUInt32LE(cursor + 42),
      compressedSize: zip.readUInt32LE(cursor + 20),
    });
    cursor += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function readEntry(zip, entry) {
  const header = entry.localHeader;
  const start = header + 30 + zip.readUInt16LE(header + 26) + zip.readUInt16LE(header + 28);
  const raw = zip.subarray(start, start + entry.compressedSize);
  return entry.method === 0 ? raw : zlib.inflateRawSync(raw);
}

function checkArchive(zip, label, unsigned) {
  for (const entry of readCentralDirectory(zip)) {
    if (entry.name.endsWith('/')) continue;
    if (!/\.(exe|dll|node)$/i.test(entry.name)) continue;

    const contents = readEntry(zip, entry);
    if (!isPortableExecutable(contents)) continue;
    if (!hasCertificateTable(contents)) unsigned.push(`${label} -> ${entry.name}`);
  }
}

function main() {
  const distDir = process.argv[2] || path.join(__dirname, '..', 'dist');
  const setupPath = path.join(distDir, 'MailspringSetup.exe');
  if (!fs.existsSync(setupPath)) {
    console.error(`No installer found at ${setupPath}`);
    process.exit(1);
  }

  const unsigned = [];
  const setup = fs.readFileSync(setupPath);
  if (!hasCertificateTable(setup)) unsigned.push('MailspringSetup.exe');

  const payload = findEmbeddedZip(setup);
  if (!payload) {
    console.error('Could not find the payload zip inside MailspringSetup.exe');
    process.exit(1);
  }
  // The payload's nupkg is a copy of the one written beside the installer.
  const update = readCentralDirectory(payload).find((e) => /^Update\.exe$/i.test(e.name));
  if (!update) {
    console.error('Could not find Update.exe inside MailspringSetup.exe');
    process.exit(1);
  }
  if (!hasCertificateTable(readEntry(payload, update))) {
    unsigned.push('MailspringSetup.exe -> Update.exe');
  }

  const packages = fs.readdirSync(distDir).filter((f) => f.endsWith('.nupkg'));
  if (packages.length === 0) {
    console.error(`No .nupkg found in ${distDir}`);
    process.exit(1);
  }
  for (const name of packages) {
    checkArchive(fs.readFileSync(path.join(distDir, name)), name, unsigned);
  }

  if (unsigned.length > 0) {
    console.error('Unsigned binaries would ship to users:');
    unsigned.forEach((f) => console.error(`  ${f}`));
    process.exit(1);
  }

  console.log(`Verified MailspringSetup.exe and ${packages.join(', ')}: all binaries signed.`);
}

main();
