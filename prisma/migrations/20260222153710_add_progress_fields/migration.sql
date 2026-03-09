-- DropForeignKey
ALTER TABLE `announcement` DROP FOREIGN KEY `Announcement_authorId_fkey`;

-- DropForeignKey
ALTER TABLE `attendance` DROP FOREIGN KEY `Attendance_userId_fkey`;

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `Booking_classId_fkey`;

-- DropForeignKey
ALTER TABLE `booking` DROP FOREIGN KEY `Booking_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `class` DROP FOREIGN KEY `Class_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `class` DROP FOREIGN KEY `Class_trainerId_fkey`;

-- DropForeignKey
ALTER TABLE `equipment` DROP FOREIGN KEY `Equipment_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `expense` DROP FOREIGN KEY `Expense_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `followup` DROP FOREIGN KEY `FollowUp_leadId_fkey`;

-- DropForeignKey
ALTER TABLE `inventory` DROP FOREIGN KEY `Inventory_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `invoice` DROP FOREIGN KEY `Invoice_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `lead` DROP FOREIGN KEY `Lead_assignedToId_fkey`;

-- DropForeignKey
ALTER TABLE `lead` DROP FOREIGN KEY `Lead_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `locker` DROP FOREIGN KEY `Locker_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `maintenancerequest` DROP FOREIGN KEY `MaintenanceRequest_equipmentId_fkey`;

-- DropForeignKey
ALTER TABLE `member` DROP FOREIGN KEY `Member_planId_fkey`;

-- DropForeignKey
ALTER TABLE `member` DROP FOREIGN KEY `Member_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `member` DROP FOREIGN KEY `Member_trainerId_fkey`;

-- DropForeignKey
ALTER TABLE `memberprogress` DROP FOREIGN KEY `MemberProgress_memberId_fkey`;

-- DropForeignKey
ALTER TABLE `membershipplan` DROP FOREIGN KEY `MembershipPlan_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `payroll` DROP FOREIGN KEY `Payroll_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `task` DROP FOREIGN KEY `Task_assignedToId_fkey`;

-- DropForeignKey
ALTER TABLE `task` DROP FOREIGN KEY `Task_creatorId_fkey`;

-- DropForeignKey
ALTER TABLE `tenantsettings` DROP FOREIGN KEY `TenantSettings_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `transaction` DROP FOREIGN KEY `Transaction_walletId_fkey`;

-- DropForeignKey
ALTER TABLE `user` DROP FOREIGN KEY `User_tenantId_fkey`;

-- DropForeignKey
ALTER TABLE `wallet` DROP FOREIGN KEY `Wallet_memberId_fkey`;

-- AlterTable
ALTER TABLE `announcement` ADD COLUMN `priority` VARCHAR(191) NOT NULL DEFAULT 'medium',
    ADD COLUMN `targetRole` VARCHAR(191) NOT NULL DEFAULT 'all',
    ADD COLUMN `tenantId` INTEGER NULL;

-- AlterTable
ALTER TABLE `attendance` ADD COLUMN `date` DATE NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'Present',
    ADD COLUMN `tenantId` INTEGER NOT NULL DEFAULT 1,
    MODIFY `checkIn` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `device` ADD COLUMN `entriesToday` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `ipAddress` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `equipment` MODIFY `tenantId` INTEGER NULL;

-- AlterTable
ALTER TABLE `expense` ADD COLUMN `addedBy` VARCHAR(191) NULL,
    ADD COLUMN `notes` TEXT NULL;

-- AlterTable
ALTER TABLE `inventory` MODIFY `tenantId` INTEGER NULL;

-- AlterTable
ALTER TABLE `locker` MODIFY `tenantId` INTEGER NULL;

-- AlterTable
ALTER TABLE `memberprogress` ADD COLUMN `measurements` JSON NULL,
    ADD COLUMN `photos` JSON NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `accountNumber` VARCHAR(191) NULL,
    ADD COLUMN `baseSalary` DECIMAL(10, 2) NULL,
    ADD COLUMN `config` JSON NULL,
    ADD COLUMN `department` VARCHAR(191) NULL,
    ADD COLUMN `documents` JSON NULL,
    ADD COLUMN `ifsc` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `leave_request` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `userId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'Vacation',
    `startDate` DATETIME(3) NOT NULL,
    `endDate` DATETIME(3) NOT NULL,
    `reason` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trainer_availability` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `trainerId` INTEGER NOT NULL,
    `weeklySchedule` JSON NOT NULL,
    `preferences` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `trainer_availability_trainerId_key`(`trainerId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reward` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `memberId` INTEGER NULL,
    `name` VARCHAR(191) NOT NULL DEFAULT 'Reward',
    `points` INTEGER NOT NULL DEFAULT 0,
    `description` VARCHAR(191) NOT NULL DEFAULT '',
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `feedback` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NULL,
    `memberId` INTEGER NULL,
    `rating` INTEGER NOT NULL,
    `comment` TEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `diet_plan` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `trainerId` INTEGER NOT NULL,
    `clientId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `target` VARCHAR(191) NOT NULL,
    `duration` VARCHAR(191) NOT NULL,
    `calories` INTEGER NOT NULL,
    `macros` JSON NOT NULL,
    `meals` JSON NOT NULL,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `workout_plan` (
    `id` VARCHAR(191) NOT NULL,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `trainerId` INTEGER NOT NULL,
    `clientId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `level` VARCHAR(191) NOT NULL DEFAULT 'Beginner',
    `duration` VARCHAR(191) NOT NULL,
    `goal` VARCHAR(191) NOT NULL,
    `volume` VARCHAR(191) NOT NULL,
    `timePerSession` VARCHAR(191) NOT NULL,
    `intensity` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `days` JSON NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- RedefineIndex
DROP INDEX `Invoice_invoiceNumber_key` ON `invoice`;
CREATE UNIQUE INDEX `invoice_invoiceNumber_key` ON `invoice`(`invoiceNumber`);

-- RedefineIndex
DROP INDEX `Member_memberId_key` ON `member`;
CREATE UNIQUE INDEX `member_memberId_key` ON `member`(`memberId`);

-- RedefineIndex
DROP INDEX `Member_userId_key` ON `member`;
CREATE UNIQUE INDEX `member_userId_key` ON `member`(`userId`);

-- RedefineIndex
DROP INDEX `SaasPayment_paymentId_key` ON `saaspayment`;
CREATE UNIQUE INDEX `saaspayment_paymentId_key` ON `saaspayment`(`paymentId`);

-- RedefineIndex
DROP INDEX `TenantSettings_tenantId_key` ON `tenantsettings`;
CREATE UNIQUE INDEX `tenantsettings_tenantId_key` ON `tenantsettings`(`tenantId`);

-- RedefineIndex
DROP INDEX `User_email_key` ON `user`;
CREATE UNIQUE INDEX `user_email_key` ON `user`(`email`);

-- RedefineIndex
DROP INDEX `Wallet_memberId_key` ON `wallet`;
CREATE UNIQUE INDEX `wallet_memberId_key` ON `wallet`(`memberId`);

-- AddForeignKey
ALTER TABLE `user` ADD CONSTRAINT `user_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member` ADD CONSTRAINT `member_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member` ADD CONSTRAINT `member_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `membershipplan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `member` ADD CONSTRAINT `member_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membershipplan` ADD CONSTRAINT `membershipplan_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `lead_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `lead` ADD CONSTRAINT `lead_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `followup` ADD CONSTRAINT `followup_leadId_fkey` FOREIGN KEY (`leadId`) REFERENCES `lead`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class` ADD CONSTRAINT `class_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `class` ADD CONSTRAINT `class_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `booking` ADD CONSTRAINT `booking_classId_fkey` FOREIGN KEY (`classId`) REFERENCES `class`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locker` ADD CONSTRAINT `locker_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `equipment` ADD CONSTRAINT `equipment_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `maintenancerequest` ADD CONSTRAINT `maintenancerequest_equipmentId_fkey` FOREIGN KEY (`equipmentId`) REFERENCES `equipment`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice` ADD CONSTRAINT `invoice_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `expense` ADD CONSTRAINT `expense_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payroll` ADD CONSTRAINT `payroll_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_request` ADD CONSTRAINT `leave_request_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `leave_request` ADD CONSTRAINT `leave_request_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trainer_availability` ADD CONSTRAINT `trainer_availability_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `trainer_availability` ADD CONSTRAINT `trainer_availability_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `wallet` ADD CONSTRAINT `wallet_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `transaction` ADD CONSTRAINT `transaction_walletId_fkey` FOREIGN KEY (`walletId`) REFERENCES `wallet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `memberprogress` ADD CONSTRAINT `memberprogress_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement` ADD CONSTRAINT `announcement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement` ADD CONSTRAINT `announcement_authorId_fkey` FOREIGN KEY (`authorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tenantsettings` ADD CONSTRAINT `tenantsettings_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reward` ADD CONSTRAINT `reward_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reward` ADD CONSTRAINT `reward_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback` ADD CONSTRAINT `feedback_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `feedback` ADD CONSTRAINT `feedback_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diet_plan` ADD CONSTRAINT `diet_plan_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diet_plan` ADD CONSTRAINT `diet_plan_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `diet_plan` ADD CONSTRAINT `diet_plan_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workout_plan` ADD CONSTRAINT `workout_plan_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workout_plan` ADD CONSTRAINT `workout_plan_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `workout_plan` ADD CONSTRAINT `workout_plan_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

