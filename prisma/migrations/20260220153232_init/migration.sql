/*
  Warnings:

  - You are about to drop the column `features` on the `membershipplan` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Lead` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `MembershipPlan` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `SaaSPlan` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `class` ADD COLUMN `duration` VARCHAR(191) NULL,
    ADD COLUMN `location` VARCHAR(191) NULL,
    ADD COLUMN `requiredBenefit` VARCHAR(191) NULL,
    ADD COLUMN `status` VARCHAR(191) NOT NULL DEFAULT 'Scheduled',
    MODIFY `trainerId` INTEGER NULL;

-- AlterTable
ALTER TABLE `equipment` ADD COLUMN `brand` VARCHAR(191) NULL,
    ADD COLUMN `category` VARCHAR(191) NULL,
    ADD COLUMN `location` VARCHAR(191) NULL,
    ADD COLUMN `model` VARCHAR(191) NULL,
    ADD COLUMN `purchaseDate` DATETIME(3) NULL,
    ADD COLUMN `serialNumber` VARCHAR(191) NULL,
    ADD COLUMN `warrantyExpiry` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `invoice` ADD COLUMN `paymentMode` VARCHAR(191) NOT NULL DEFAULT 'Cash';

-- AlterTable
ALTER TABLE `lead` ADD COLUMN `age` INTEGER NULL,
    ADD COLUMN `assignedToId` INTEGER NULL,
    ADD COLUMN `budget` VARCHAR(191) NULL,
    ADD COLUMN `gender` VARCHAR(191) NULL,
    ADD COLUMN `interests` JSON NULL,
    ADD COLUMN `nextFollowUp` DATETIME(3) NULL,
    ADD COLUMN `notes` TEXT NULL,
    ADD COLUMN `preferredContact` VARCHAR(191) NULL DEFAULT 'WhatsApp',
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `member` ADD COLUMN `avatar` VARCHAR(191) NULL,
    ADD COLUMN `benefits` JSON NULL,
    ADD COLUMN `email` VARCHAR(191) NULL,
    ADD COLUMN `emergencyName` VARCHAR(191) NULL,
    ADD COLUMN `emergencyPhone` VARCHAR(191) NULL,
    ADD COLUMN `fitnessGoal` VARCHAR(191) NULL,
    ADD COLUMN `gender` VARCHAR(191) NULL,
    ADD COLUMN `medicalHistory` TEXT NULL,
    ADD COLUMN `name` VARCHAR(191) NULL,
    ADD COLUMN `phone` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `membershipplan` DROP COLUMN `features`,
    ADD COLUMN `benefits` JSON NULL,
    ADD COLUMN `cancellationWindow` INTEGER NOT NULL DEFAULT 4,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `creditsPerBooking` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `durationType` VARCHAR(191) NOT NULL DEFAULT 'Months',
    ADD COLUMN `maxBookingsPerDay` INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN `maxBookingsPerWeek` INTEGER NOT NULL DEFAULT 7,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL;

-- AlterTable
ALTER TABLE `saasplan` ADD COLUMN `benefits` JSON NULL,
    ADD COLUMN `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `limits` JSON NULL,
    ADD COLUMN `opsLimits` JSON NULL,
    ADD COLUMN `updatedAt` DATETIME(3) NOT NULL,
    MODIFY `features` JSON NULL;

-- AlterTable
ALTER TABLE `saassettings` ADD COLUMN `contactAddress` TEXT NULL,
    ADD COLUMN `contactPhone` VARCHAR(191) NULL,
    ADD COLUMN `supportEmail` VARCHAR(191) NULL;

-- AlterTable
ALTER TABLE `user` ADD COLUMN `address` TEXT NULL;

-- AddForeignKey
ALTER TABLE `Member` ADD CONSTRAINT `Member_planId_fkey` FOREIGN KEY (`planId`) REFERENCES `MembershipPlan`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Lead` ADD CONSTRAINT `Lead_assignedToId_fkey` FOREIGN KEY (`assignedToId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Class` ADD CONSTRAINT `Class_trainerId_fkey` FOREIGN KEY (`trainerId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
