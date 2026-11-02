import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using Fieldnotes and publishing on the site.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of service"
      introduction="A few clear expectations help keep Fieldnotes useful, thoughtful, and safe for everyone."
      sections={[
        {
          title: "Using Fieldnotes",
          paragraphs: [
            "You must be able to form a binding agreement where you live to create an account. Keep your sign-in details secure and use your own account.",
            "Do not use Fieldnotes to break the law, threaten or harass people, impersonate someone, upload malicious material, or interfere with the service.",
          ],
        },
        {
          title: "Your writing and images",
          paragraphs: [
            "You keep ownership of the writing and images you submit. By publishing, you give Fieldnotes permission to store, display, and distribute that material as needed to run the publication and show it to readers.",
            "Only publish material you have the right to share. Published notes and writer profiles are visible to the public. Drafts are visible only to their author.",
          ],
        },
        {
          title: "Accounts and published material",
          paragraphs: [
            "You are responsible for the content you submit. Fieldnotes may remove content or restrict accounts that violate these terms or put readers or the service at risk.",
            "You can manage your profile and writing from your dashboard. Deleting your account or requesting removal of account data may require help from the site operator.",
          ],
        },
        {
          title: "Availability and changes",
          paragraphs: [
            "Fieldnotes is provided as available. Features may change, and uninterrupted access is not guaranteed. To the extent allowed by law, Fieldnotes is not responsible for indirect losses resulting from your use of the service.",
            "These terms may be updated as the service changes. Continued use after an update means you accept the revised terms.",
          ],
        },
      ]}
    />
  );
}
