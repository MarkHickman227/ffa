const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const p = new PrismaClient()

async function main() {
  const hash = await bcrypt.hash('Password123!', 12)
  const adminHash = await bcrypt.hash('AdminPass999!', 12)

  const accounts = [
    { email: 'alice.seller@test.ffa',        firstName: 'Alice',   lastName: 'Thompson', role: 'SELLER',      passwordHash: hash },
    { email: 'bob.buyer@test.ffa',            firstName: 'Bob',     lastName: 'Harrison', role: 'BUYER',       passwordHash: hash },
    { email: 'claire.conv@smithpartners.test',firstName: 'Claire',  lastName: 'Davies',   role: 'CONVEYANCER', passwordHash: hash },
    { email: 'david.agent@premier.test',      firstName: 'David',   lastName: 'Williams', role: 'AGENT',       passwordHash: hash },
    { email: 'eve.surveyor@test.ffa',         firstName: 'Eve',     lastName: 'Martin',   role: 'SURVEYOR',    passwordHash: hash },
    { email: 'frank.seller@test.ffa',         firstName: 'Frank',   lastName: 'Johnson',  role: 'SELLER',      passwordHash: hash },
    { email: 'grace.buyer@test.ffa',          firstName: 'Grace',   lastName: 'Lee',      role: 'BUYER',       passwordHash: hash },
    { email: 'jessica.greenwood@test.ffa',    firstName: 'Jessica', lastName: 'Greenwood',role: 'CONVEYANCER', passwordHash: hash },
    { email: 'admin@ffa.internal',            firstName: 'System',  lastName: 'Admin',    role: 'ADMIN',       passwordHash: adminHash },
  ]

  for (const a of accounts) {
    const user = await p.user.upsert({
      where: { email: a.email },
      update: { passwordHash: a.passwordHash, failedLogins: 0, lockedUntil: null },
      create: { email: a.email, firstName: a.firstName, lastName: a.lastName, role: a.role, passwordHash: a.passwordHash },
      select: { email: true, role: true },
    })
    console.log(`✓ ${user.email} (${user.role})`)
  }

  console.log('\nPasswords reset:')
  console.log('  Most accounts: Password123!')
  console.log('  admin@ffa.internal: AdminPass999!')
}

main().catch((e) => { console.error(e.message); process.exit(1) }).finally(() => p.$disconnect())
