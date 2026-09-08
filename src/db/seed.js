// ============================================================
// Seed script — populate the database with the SelectProperty team
// Run with: node src/db/seed.js
// ============================================================
const bcrypt = require('bcrypt');
const pool = require('./connection');

const TEAM = [
{ email: 'bukhari.matheen@gmail.com',     name: 'Matheen1',       initials: 'MB', role: 'designer',  region: 'GCC'    },
  { email: 'joey@test.com',     name: 'Joey',       initials: 'JO', role: 'content_exec',  region: 'GCC'    },
  { email: 'hannah@test.com',   name: 'Hannah',     initials: 'HA', role: 'hom',           region: 'Global' },
  { email: 'amber@test.com',    name: 'Amber',      initials: 'AM', role: 'hom',           region: 'GCC'    },
  { email: 'beth@test.com',     name: 'Beth',       initials: 'BE', role: 'hom',           region: 'UK'     },
  { email: 'chris@test.com',    name: 'Chris',      initials: 'CR', role: 'creative',      region: 'Global' },
  { email: 'matheen@test.com',  name: 'Matheen',    initials: 'MA', role: 'creative',      region: 'Global' },
  { email: 'alex@test.com',     name: 'Alex',       initials: 'AX', role: 'social',        region: 'Global' },
  { email: 'rhiannon@test.com', name: 'Rhiannon',   initials: 'RH', role: 'crm',           region: 'Global' },
  { email: 'adam@test.com',     name: 'Adam Price', initials: 'AP', role: 'ceo',           region: 'Global' },
  { email: 'mohammed@test.com', name: 'Mohammed',   initials: 'MO', role: 'arabic_qa',     region: 'GCC'    },
];

const STARTER_PASSWORD = 'password123';

async function seed() {
  try {
    console.log('🌱 Seeding team members...\n');

    // Hash the shared starter password once
    const passwordHash = await bcrypt.hash(STARTER_PASSWORD, 10);

    // Clear existing users (fresh seed every time)
    await pool.query('TRUNCATE users RESTART IDENTITY CASCADE');
    console.log('   Cleared existing users\n');

    // Insert each team member
    for (const member of TEAM) {
      const result = await pool.query(
        `INSERT INTO users (email, password_hash, name, initials, role, region)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, name, role, region`,
        [member.email, passwordHash, member.name, member.initials, member.role, member.region]
      );
      const u = result.rows[0];
      console.log(`   ✓ [${String(u.id).padStart(2)}] ${u.name.padEnd(12)} · ${u.role.padEnd(12)} · ${u.region}`);
    }

    console.log(`\n✅ Seeded ${TEAM.length} team members`);
    console.log(`🔑 All users have password: ${STARTER_PASSWORD}\n`);
    process.exit(0);
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  }
}

seed();
