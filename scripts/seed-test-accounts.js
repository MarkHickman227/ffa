const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')
const p = new PrismaClient()

async function setup() {
  const hash = await bcrypt.hash('Test1234', 12)

  let firm = await p.firm.findFirst({ where: { name: 'Greenwood Solicitors' }, select: { id: true, name: true } })
  if (!firm) firm = await p.firm.create({ data: { name: 'Greenwood Solicitors' }, select: { id: true, name: true } })
  console.log('firm:', JSON.stringify(firm))

  const conv = await p.user.upsert({
    where: { email: 'jessica.greenwood@test.ffa' },
    update: { passwordHash: hash, failedLogins: 0, lockedUntil: null, firmId: firm.id },
    create: {
      email: 'jessica.greenwood@test.ffa',
      firstName: 'Jessica',
      lastName: 'Greenwood',
      role: 'CONVEYANCER',
      firmId: firm.id,
      passwordHash: hash,
    },
    select: { email: true, role: true, firmId: true },
  })
  console.log('conveyancer:', JSON.stringify(conv))

  const agent = await p.user.upsert({
    where: { email: 'david.agent@test.ffa' },
    update: { passwordHash: hash, failedLogins: 0, lockedUntil: null },
    create: {
      email: 'david.agent@test.ffa',
      firstName: 'David',
      lastName: 'Agent',
      role: 'AGENT',
      passwordHash: hash,
    },
    select: { email: true, role: true },
  })
  console.log('agent:', JSON.stringify(agent))

  const tx = await p.transaction.update({
    where: { id: '27954cbe-05cb-4ff3-8f52-c833cd45f347' },
    data: {
      conveyancerFirmId: firm.id,
      status: 'SELLER_FORM_IN_PROGRESS',
      sellerSubmittedAt: null,
    },
    select: { reference: true, status: true, conveyancerFirmId: true },
  })
  console.log('transaction:', JSON.stringify(tx))

  await p.$disconnect()
}

setup().catch((e) => {
  console.error(e.message)
  process.exit(1)
})
