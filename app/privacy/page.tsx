import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy",
  description: "What Fieldnotes stores and how information is used.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy"
      introduction="Fieldnotes uses a small amount of information to run accounts, publish writing, and send the monthly digest."
      sections={[
        {
          title: "Information you provide",
          paragraphs: [
            "When you create an account, we receive your email address and the profile information you choose to add. We store the notes, drafts, and images you submit so the writing studio and publication can work.",
            "If you subscribe to the monthly digest, we store your email address and subscription preference. You can unsubscribe using the link in any digest email.",
          ],
        },
        {
          title: "What readers can see",
          paragraphs: [
            "Published notes and public writer profiles can be viewed by anyone. Drafts and their private cover images are available only to the account that created them.",
            "Friend requests are visible to the people involved. Accepting a request adds a friend connection; it does not change the visibility of published notes.",
          ],
        },
        {
          title: "How information is used",
          paragraphs: [
            "Information is used to authenticate accounts, display profiles and published notes, store images, manage friend requests, and deliver the monthly digest you requested.",
            "Fieldnotes relies on service providers for hosting, authentication, database and image storage, and email delivery. Information needed to provide those services is processed by those providers.",
          ],
        },
        {
          title: "Retention and your choices",
          paragraphs: [
            "Account information and writing remain stored while the account and content are active. Subscription preferences are kept so an unsubscribed address is not added back to future mailings without a new subscription.",
            "You can edit your profile, remove friend connections, and unsubscribe from emails. For help with information that cannot be changed in the dashboard, contact the site operator through the account support channel.",
          ],
        },
      ]}
    />
  );
}
