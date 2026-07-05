-- CreateEnum
CREATE TYPE "BoardInviteStatus" AS ENUM ('pending', 'declined');

-- CreateTable
CREATE TABLE "BoardInvite" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "role" "BoardRole" NOT NULL,
    "status" "BoardInviteStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BoardInvite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BoardInvite_boardId_inviteeId_key" ON "BoardInvite"("boardId", "inviteeId");

-- AddForeignKey
ALTER TABLE "BoardInvite" ADD CONSTRAINT "BoardInvite_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "Board"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardInvite" ADD CONSTRAINT "BoardInvite_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoardInvite" ADD CONSTRAINT "BoardInvite_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
