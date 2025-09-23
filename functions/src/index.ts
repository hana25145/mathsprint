import { beforeSignIn } from "firebase-functions/v2/identity";
import * as admin from "firebase-admin";

admin.initializeApp();

export const blockBannedEmails = beforeSignIn(async (event) => {
  const email = (event.data?.email || "").toLowerCase();

  const banned = ["baduser@gmail.com", "spam@evil.com"];
  if (banned.includes(email)) {
    throw new Error("This account has been banned.");
  }

  return;
});
