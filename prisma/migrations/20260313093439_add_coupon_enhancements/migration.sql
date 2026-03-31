/*
  Warnings:

  - You are about to alter the column `priority` on the `announcement` table. The data in that column could be lost. The data in that column will be cast from `VarChar(191)` to `Int`.
  - Made the column `tenantId` on table `announcement` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `updatedAt` to the `locker` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `attendance` DROP FOREIGN KEY `attendance_userId_fkey`;

-- DropIndex
DROP INDEX `announcement_tenantId_fkey` ON `announcement`;

-- DropIndex
DROP INDEX `diet_plan_clientId_fkey` ON `diet_plan`;

-- DropIndex
DROP INDEX `diet_plan_tenantId_fkey` ON `diet_plan`;

-- DropIndex
DROP INDEX `diet_plan_trainerId_fkey` ON `diet_plan`;

-- DropIndex
DROP INDEX `feedback_memberId_fkey` ON `feedback`;

-- DropIndex
DROP INDEX `feedback_tenantId_fkey` ON `feedback`;

-- DropIndex
DROP INDEX `reward_memberId_fkey` ON `reward`;

-- DropIndex
DROP INDEX `reward_tenantId_fkey` ON `reward`;

-- DropIndex
DROP INDEX `trainer_availability_tenantId_fkey` ON `trainer_availability`;

-- DropIndex
DROP INDEX `workout_plan_clientId_fkey` ON `workout_plan`;

-- DropIndex
DROP INDEX `workout_plan_tenantId_fkey` ON `workout_plan`;

-- DropIndex
DROP INDEX `workout_plan_trainerId_fkey` ON `workout_plan`;

-- AlterTable
ALTER TABLE `announcement` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    MODIFY `priority` INTEGER NOT NULL DEFAULT 0,
    MODIFY `tenantId` INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE `attendance` ADD COLUMN `memberId` INTEGER NULL,
    MODIFY `userId` INTEGER NULL,
    MODIFY `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `auditlog` ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'Open';

-- AlterTable
ALTER TABLE `class` ADD COLUMN `price` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `coupon` ADD COLUMN `applicableService` VARCHAR(191) NOT NULL DEFAULT 'All',
    ADD COLUMN `maximumDiscount` DECIMAL(10, 2) NULL,
    ADD COLUMN `targetedMemberIds` TEXT NULL,
    ADD COLUMN `visibilityType` VARCHAR(191) NOT NULL DEFAULT 'Public';

-- AlterTable
ALTER TABLE `diet_plan` ADD COLUMN `endDate` DATETIME(3) NULL,
    ADD COLUMN `startDate` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `equipment` ADD COLUMN `purchasePrice` DECIMAL(10, 2) NULL;

-- AlterTable
ALTER TABLE `feedback` ADD COLUMN `isPublishedToGoogle` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `invoice` ADD COLUMN `bookingId` INTEGER NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `invoice_item` ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);

-- AlterTable
ALTER TABLE `lead` ADD COLUMN `lostReason` VARCHAR(191) NULL,
    ADD COLUMN `rewardStatus` VARCHAR(191) NOT NULL DEFAULT 'Pending';

-- AlterTable
ALTER TABLE `locker` ADD COLUMN `area` VARCHAR(191) NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `isChargeable` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `isPaid` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `price` DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN `size` VARCHAR(191) NOT NULL DEFAULT 'Medium',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `maintenancerequest` ADD COLUMN `completedAt` DATETIME(3) NULL,
    ADD COLUMN `cost` DECIMAL(10, 2) NULL DEFAULT 0.00,
    ADD COLUMN `description` TEXT NULL;

-- AlterTable
ALTER TABLE `member` ADD COLUMN `address` TEXT NULL,
    ADD COLUMN `dob` VARCHAR(191) NULL,
    ADD COLUMN `idNumber` VARCHAR(191) NULL,
    ADD COLUMN `idType` VARCHAR(191) NULL,
    ADD COLUMN `referralCode` VARCHAR(191) NULL,
    ADD COLUMN `source` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `membershipplan` ADD COLUMN `allowTransfer` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `includeLocker` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `showInPurchase` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `showOnDashboard` BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE `saassettings` ADD COLUMN `supportNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `store_order` ADD COLUMN `couponCode` VARCHAR(191) NULL,
    ADD COLUMN `discountAmount` DECIMAL(10, 2) NULL DEFAULT 0.00,
    ADD COLUMN `paymentMode` VARCHAR(191) NULL DEFAULT 'Cash',
    ADD COLUMN `referenceNumber` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `task` ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `tenantId` INTEGER NULL;

-- AlterTable
ALTER TABLE `tenant` ADD COLUMN `managerEmail` VARCHAR(191) NULL,
    ADD COLUMN `managerName` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `tenantsettings` ADD COLUMN `announcements` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `classNotifications` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `fiscalYearStart` VARCHAR(191) NOT NULL DEFAULT 'April',
    ADD COLUMN `googleBusinessEnabled` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `googleReviewLink` TEXT NULL,
    ADD COLUMN `loginAlerts` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `lowStockAlerts` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `membershipReminders` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `newLeadAlerts` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `paymentAlerts` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `paymentReceipts` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `sessionDuration` VARCHAR(191) NOT NULL DEFAULT '8',
    ADD COLUMN `sessionTimeout` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `taskReminders` BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN `twoFactorAuth` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `workout_plan` ADD COLUMN `endDate` DATETIME(3) NULL,
    ADD COLUMN `startDate` DATETIME(3) NULL;

-- CreateTable
CREATE TABLE `expense_category` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `expensecat_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `userId` INTEGER NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `message` TEXT NOT NULL,
    `type` VARCHAR(191) NOT NULL DEFAULT 'info',
    `read` BOOLEAN NOT NULL DEFAULT false,
    `link` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `notification_userId_fkey`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `service_request` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `memberId` INTEGER NOT NULL,
    `type` VARCHAR(191) NOT NULL,
    `rawType` VARCHAR(191) NULL,
    `details` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Pending',
    `date` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `service_request_tenantId_fkey`(`tenantId`),
    INDEX `service_request_memberId_fkey`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `message_template` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `name` VARCHAR(191) NOT NULL,
    `content` LONGTEXT NOT NULL,
    `channel` VARCHAR(191) NOT NULL,
    `category` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `communication_log` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `senderId` INTEGER NULL,
    `memberId` INTEGER NULL,
    `channel` VARCHAR(191) NOT NULL,
    `message` LONGTEXT NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Sent',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `used_coupon` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `couponId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `usedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `usedcoupon_couponId_fkey`(`couponId`),
    INDEX `usedcoupon_memberId_fkey`(`memberId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `amenity` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(191) NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `gender` VARCHAR(191) NOT NULL DEFAULT 'UNISEX',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `amenity_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pt_package` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sessionType` VARCHAR(191) NOT NULL DEFAULT 'Fixed Sessions',
    `totalSessions` INTEGER NOT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `gstPercent` DECIMAL(5, 2) NOT NULL DEFAULT 18.00,
    `gstInclusive` BOOLEAN NOT NULL DEFAULT false,
    `validityDays` INTEGER NOT NULL DEFAULT 90,
    `description` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pt_member_account` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `packageId` INTEGER NOT NULL,
    `totalSessions` INTEGER NOT NULL,
    `remainingSessions` INTEGER NOT NULL,
    `expiryDate` DATETIME(3) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Active',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `pt_member_account_memberId_fkey`(`memberId`),
    INDEX `pt_member_account_packageId_fkey`(`packageId`),
    INDEX `pt_member_account_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pt_session` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL,
    `memberId` INTEGER NOT NULL,
    `trainerId` INTEGER NOT NULL,
    `ptAccountId` INTEGER NULL,
    `date` DATETIME(3) NOT NULL,
    `time` VARCHAR(191) NULL,
    `duration` INTEGER NOT NULL DEFAULT 60,
    `notes` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'Completed',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `pt_session_memberId_fkey`(`memberId`),
    INDEX `pt_session_trainerId_fkey`(`trainerId`),
    INDEX `pt_session_ptAccountId_fkey`(`ptAccountId`),
    INDEX `pt_session_tenantId_fkey`(`tenantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chat_message` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `tenantId` INTEGER NOT NULL DEFAULT 1,
    `senderId` INTEGER NOT NULL,
    `receiverId` INTEGER NOT NULL,
    `message` LONGTEXT NULL,
    `attachmentUrl` LONGTEXT NULL,
    `attachmentType` VARCHAR(191) NULL DEFAULT 'image',
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `chat_message_senderId_idx`(`senderId`),
    INDEX `chat_message_receiverId_idx`(`receiverId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `Announcement_authorId_fkey` ON `announcement`(`authorId`);

-- CreateIndex
CREATE INDEX `attendance_memberId_fkey` ON `attendance`(`memberId`);

-- CreateIndex
CREATE INDEX `invoice_status_idx` ON `invoice`(`status`);

-- CreateIndex
CREATE INDEX `invoice_paidDate_idx` ON `invoice`(`paidDate`);

-- CreateIndex
CREATE INDEX `lead_name_idx` ON `lead`(`name`);

-- CreateIndex
CREATE INDEX `lead_phone_idx` ON `lead`(`phone`);

-- CreateIndex
CREATE INDEX `lead_email_idx` ON `lead`(`email`);

-- CreateIndex
CREATE INDEX `locker_memberId_fkey` ON `locker`(`assignedToId`);

-- CreateIndex
CREATE INDEX `member_name_idx` ON `member`(`name`);

-- CreateIndex
CREATE INDEX `member_phone_idx` ON `member`(`phone`);

-- CreateIndex
CREATE INDEX `member_email_idx` ON `member`(`email`);

-- CreateIndex
CREATE INDEX `MemberProgress_memberId_fkey` ON `memberprogress`(`memberId`);

-- CreateIndex
CREATE INDEX `subscription_tenantId_fkey` ON `subscription`(`tenantId`);

-- CreateIndex
CREATE INDEX `subscription_planId_fkey` ON `subscription`(`planId`);

-- CreateIndex
CREATE INDEX `Task_assignedToId_fkey` ON `task`(`assignedToId`);

-- CreateIndex
CREATE INDEX `Task_creatorId_fkey` ON `task`(`creatorId`);

-- CreateIndex
CREATE INDEX `Transaction_walletId_fkey` ON `transaction`(`walletId`);

-- AddForeignKey
ALTER TABLE `expense_category` ADD CONSTRAINT `expense_category_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `notification` ADD CONSTRAINT `notification_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription` ADD CONSTRAINT `subscription_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `subscription` ADD CONSTRAINT `subscription_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `saasplan`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request` ADD CONSTRAINT `service_request_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `service_request` ADD CONSTRAINT `service_request_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `locker` ADD CONSTRAINT `locker_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invoice` ADD CONSTRAINT `invoice_bookingId_fkey` FOREIGN KEY (`bookingId`) REFERENCES `booking`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `attendance` ADD CONSTRAINT `attendance_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_creatorId_fkey` FOREIGN KEY (`creatorId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `task` ADD CONSTRAINT `task_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `announcement` ADD CONSTRAINT `announcement_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `used_coupon` ADD CONSTRAINT `used_coupon_couponId_fkey` FOREIGN KEY (`couponId`) REFERENCES `coupon`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `used_coupon` ADD CONSTRAINT `used_coupon_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `amenity` ADD CONSTRAINT `amenity_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_package` ADD CONSTRAINT `pt_package_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_member_account` ADD CONSTRAINT `pt_member_account_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_member_account` ADD CONSTRAINT `pt_member_account_packageId_fkey` FOREIGN KEY (`packageId`) REFERENCES `pt_package`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_member_account` ADD CONSTRAINT `pt_member_account_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_session` ADD CONSTRAINT `pt_session_memberId_fkey` FOREIGN KEY (`memberId`) REFERENCES `member`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_session` ADD CONSTRAINT `pt_session_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_session` ADD CONSTRAINT `pt_session_ptAccountId_fkey` FOREIGN KEY (`ptAccountId`) REFERENCES `pt_member_account`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `pt_session` ADD CONSTRAINT `pt_session_tenantId_fkey` FOREIGN KEY (`tenantId`) REFERENCES `tenant`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_message` ADD CONSTRAINT `chat_message_senderId_fkey` FOREIGN KEY (`senderId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chat_message` ADD CONSTRAINT `chat_message_receiverId_fkey` FOREIGN KEY (`receiverId`) REFERENCES `user`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
