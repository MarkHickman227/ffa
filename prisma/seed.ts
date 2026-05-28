import { PrismaClient, UserRole, TransactionStatus, ItemType, ItemStatus, RiskFlag } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  // ── Firms ─────────────────────────────────────────────────────────────────
  const conveyancerFirm = await prisma.firm.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      name: 'Smith & Partners Solicitors',
    },
  })

  const agentFirm = await prisma.firm.upsert({
    where: { id: '00000000-0000-0000-0000-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000002',
      name: 'Premier Properties Agency',
    },
  })

  // ── Users ─────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash('Password123!', 12)

  const seller1 = await prisma.user.upsert({
    where: { email: 'alice.seller@test.ffa' },
    update: { passwordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000010',
      email: 'alice.seller@test.ffa',
      role: UserRole.SELLER,
      firstName: 'Alice',
      lastName: 'Thompson',
      passwordHash,
    },
  })

  const buyer1 = await prisma.user.upsert({
    where: { email: 'bob.buyer@test.ffa' },
    update: { passwordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000011',
      email: 'bob.buyer@test.ffa',
      role: UserRole.BUYER,
      firstName: 'Bob',
      lastName: 'Harrison',
      passwordHash,
    },
  })

  const conveyancer1 = await prisma.user.upsert({
    where: { email: 'claire.conv@smithpartners.test' },
    update: { passwordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000012',
      email: 'claire.conv@smithpartners.test',
      role: UserRole.CONVEYANCER,
      firstName: 'Claire',
      lastName: 'Davies',
      passwordHash,
      firmId: conveyancerFirm.id,
    },
  })

  const agent1 = await prisma.user.upsert({
    where: { email: 'david.agent@premier.test' },
    update: { passwordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000013',
      email: 'david.agent@premier.test',
      role: UserRole.AGENT,
      firstName: 'David',
      lastName: 'Williams',
      passwordHash,
      firmId: agentFirm.id,
    },
  })

  const surveyor1 = await prisma.user.upsert({
    where: { email: 'eve.surveyor@test.ffa' },
    update: { passwordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000014',
      email: 'eve.surveyor@test.ffa',
      role: UserRole.SURVEYOR,
      firstName: 'Eve',
      lastName: 'Martin',
      passwordHash,
    },
  })

  const seller2 = await prisma.user.upsert({
    where: { email: 'frank.seller@test.ffa' },
    update: { passwordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000015',
      email: 'frank.seller@test.ffa',
      role: UserRole.SELLER,
      firstName: 'Frank',
      lastName: 'Johnson',
      passwordHash,
    },
  })

  const buyer2 = await prisma.user.upsert({
    where: { email: 'grace.buyer@test.ffa' },
    update: { passwordHash },
    create: {
      id: '00000000-0000-0000-0000-000000000016',
      email: 'grace.buyer@test.ffa',
      role: UserRole.BUYER,
      firstName: 'Grace',
      lastName: 'Lee',
      passwordHash,
    },
  })

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@ffa.internal' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000099',
      email: 'admin@ffa.internal',
      role: UserRole.ADMIN,
      firstName: 'System',
      lastName: 'Admin',
      passwordHash: await bcrypt.hash('AdminPass999!', 12),
    },
  })

  // ── Properties ────────────────────────────────────────────────────────────
  const property1 = await prisma.property.upsert({
    where: { id: '00000000-0000-0000-0001-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000001',
      addressLine1: '14 Elmwood Avenue',
      city: 'Bristol',
      postcode: 'BS6 5EL',
    },
  })

  const property2 = await prisma.property.upsert({
    where: { id: '00000000-0000-0000-0001-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0001-000000000002',
      addressLine1: '7 Maple Close',
      addressLine2: 'Cotham',
      city: 'Bristol',
      postcode: 'BS6 6AL',
    },
  })

  // ── Transaction 1: In progress (seller form submitted, buyer reviewing) ───
  const tx1 = await prisma.transaction.upsert({
    where: { id: '00000000-0000-0000-0002-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000001',
      reference: 'FFA-2026-0001',
      status: TransactionStatus.BUYER_REVIEW,
      propertyId: property1.id,
      sellerId: seller1.id,
      buyerId: buyer1.id,
      conveyancerFirmId: conveyancerFirm.id,
      sellerSubmittedAt: new Date('2026-04-15T10:00:00Z'),
      valuationDate: new Date('2026-03-01T00:00:00Z'),
    },
  })

  // Fixtures for tx1
  const item1 = await prisma.fixturesItem.upsert({
    where: { id: '00000000-0000-0000-0003-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000001',
      transactionId: tx1.id,
      room: 'Kitchen',
      description: 'Integrated dishwasher (Bosch Series 4)',
      itemType: ItemType.KITCHEN_APPLIANCE,
      status: ItemStatus.INCLUDED,
      riskFlag: RiskFlag.NONE,
      estimatedValue: 450,
      sortOrder: 1,
    },
  })

  const item2 = await prisma.fixturesItem.upsert({
    where: { id: '00000000-0000-0000-0003-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000002',
      transactionId: tx1.id,
      room: 'Living Room',
      description: 'Smart home hub and wall-mounted sensors (Hive)',
      itemType: ItemType.SMART_HOME,
      status: ItemStatus.EXCLUDED,
      riskFlag: RiskFlag.HIGH,
      estimatedValue: 350,
      sortOrder: 2,
    },
  })

  const item3 = await prisma.fixturesItem.upsert({
    where: { id: '00000000-0000-0000-0003-000000000003' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000003',
      transactionId: tx1.id,
      room: 'Master Bedroom',
      description: 'Fitted wardrobes',
      itemType: ItemType.FIXTURE,
      status: ItemStatus.INCLUDED,
      riskFlag: RiskFlag.NONE,
      estimatedValue: 1200,
      sortOrder: 3,
    },
  })

  const item4 = await prisma.fixturesItem.upsert({
    where: { id: '00000000-0000-0000-0003-000000000004' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000004',
      transactionId: tx1.id,
      room: 'Garden',
      description: 'Garden shed (6x8ft timber)',
      itemType: ItemType.OUTDOOR_STRUCTURE,
      status: ItemStatus.NEGOTIABLE,
      riskFlag: RiskFlag.LOW,
      estimatedValue: 300,
      sortOrder: 4,
    },
  })

  // Change log entry (immutable)
  await prisma.fixturesItemChangeLog.createMany({
    data: [
      {
        id: '00000000-0000-0000-0004-000000000001',
        fixturesItemId: item2.id,
        transactionId: tx1.id,
        changedByUserId: seller1.id,
        fieldName: 'status',
        oldValue: 'INCLUDED',
        newValue: 'EXCLUDED',
      },
    ],
    skipDuplicates: true,
  })

  // Enquiry
  await prisma.enquiry.upsert({
    where: { id: '00000000-0000-0000-0005-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0005-000000000001',
      transactionId: tx1.id,
      raisedByUserId: buyer1.id,
      fixturesItemId: item2.id,
      question: 'Will the Hive smart home hub configuration be reset before completion?',
      status: 'OPEN',
    },
  })

  // Legal acknowledgement (immutable)
  await prisma.legalAcknowledgement.createMany({
    data: [
      {
        id: '00000000-0000-0000-0006-000000000001',
        transactionId: tx1.id,
        userId: seller1.id,
        ipAddress: '203.0.113.10',
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
        legalText:
          'I confirm that the information provided in this TA10 Fixtures and Fittings form is accurate and complete to the best of my knowledge. I understand that this forms part of the legal contract for the sale of the property and that providing false information may constitute misrepresentation under the Misrepresentation Act 1967.',
        formVersion: '1.0',
      },
    ],
    skipDuplicates: true,
  })

  // Marketing inclusions
  await prisma.marketingInclusion.upsert({
    where: { id: '00000000-0000-0000-0007-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0007-000000000001',
      transactionId: tx1.id,
      fixturesItemId: item1.id,
      listedInMarketing: true,
      reconciliationStatus: 'MATCHED',
      reconciledAt: new Date('2026-04-16T09:00:00Z'),
    },
  })

  await prisma.marketingInclusion.upsert({
    where: { id: '00000000-0000-0000-0007-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0007-000000000002',
      transactionId: tx1.id,
      fixturesItemId: item3.id,
      listedInMarketing: false,
      reconciliationStatus: 'CONFLICT',
      conflictNote: 'Fitted wardrobes listed in marketing brochure but marked INCLUDED without agent confirmation',
    },
  })

  // Surveyor access
  await prisma.surveyorAccess.upsert({
    where: { id: '00000000-0000-0000-0008-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0008-000000000001',
      transactionId: tx1.id,
      surveyorUserId: surveyor1.id,
      grantedByUserId: conveyancer1.id,
    },
  })

  // ── Transaction 2: Draft (seller still completing form) ───────────────────
  const tx2 = await prisma.transaction.upsert({
    where: { id: '00000000-0000-0000-0002-000000000002' },
    update: {},
    create: {
      id: '00000000-0000-0000-0002-000000000002',
      reference: 'FFA-2026-0002',
      status: TransactionStatus.SELLER_FORM_IN_PROGRESS,
      propertyId: property2.id,
      sellerId: seller2.id,
      buyerId: buyer2.id,
      conveyancerFirmId: conveyancerFirm.id,
      valuationDate: new Date('2026-04-20T00:00:00Z'),
    },
  })

  await prisma.fixturesItem.upsert({
    where: { id: '00000000-0000-0000-0003-000000000010' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000010',
      transactionId: tx2.id,
      room: 'Kitchen',
      description: 'Range cooker (Rangemaster)',
      itemType: ItemType.KITCHEN_APPLIANCE,
      status: ItemStatus.INCLUDED,
      riskFlag: RiskFlag.MEDIUM,
      estimatedValue: 1800,
      sortOrder: 1,
      notes: 'Added after valuation date — buyer should be informed.',
    },
  })

  await prisma.fixturesItem.upsert({
    where: { id: '00000000-0000-0000-0003-000000000011' },
    update: {},
    create: {
      id: '00000000-0000-0000-0003-000000000011',
      transactionId: tx2.id,
      room: 'Bathroom',
      description: 'Freestanding bath (Heritage)',
      itemType: ItemType.BATHROOM_FITTING,
      status: ItemStatus.NEGOTIABLE,
      riskFlag: RiskFlag.NONE,
      estimatedValue: 600,
      sortOrder: 2,
    },
  })

  // Seed audit log entries
  await prisma.auditLog.createMany({
    data: [
      {
        id: '00000000-0000-0000-0009-000000000001',
        transactionId: tx1.id,
        userId: seller1.id,
        eventType: 'SELLER_FORM_SUBMITTED',
        eventData: { transactionId: tx1.id, itemCount: 4 },
        ipAddress: '203.0.113.10',
      },
      {
        id: '00000000-0000-0000-0009-000000000002',
        transactionId: tx1.id,
        userId: buyer1.id,
        eventType: 'ENQUIRY_RAISED',
        eventData: { enquiryId: '00000000-0000-0000-0005-000000000001' },
        ipAddress: '203.0.113.20',
      },
    ],
    skipDuplicates: true,
  })

  console.log('✓ Seed complete')
  console.log('  Transactions: FFA-2026-0001 (buyer review), FFA-2026-0002 (seller in progress)')
  console.log('  Conveyancer login: claire.conv@smithpartners.test / Password123!')
  console.log('  Admin login: admin@ffa.internal / AdminPass999!')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
