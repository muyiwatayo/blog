const socialLinks = [
  {
    name: "X",
    href: "https://x.com/MartinsOdeshina",
    icon: (
      <path d="M18.9 2H22l-6.8 7.8L23.2 22h-6.3L12 14.6 5.5 22H2.4l7.3-8.4L1.8 2h6.5l4.4 6.9L18.9 2Zm-1.1 18h1.7L7.3 3.9H5.5L17.8 20Z" />
    ),
  },
  {
    name: "Instagram",
    href: "https://instagram.com/mart.ins4823",
    icon: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle className="social-icon-fill" cx="18" cy="6.5" r="1" />
      </>
    ),
  },
  {
    name: "WhatsApp",
    href: "https://wa.me/2349081416637",
    icon: (
      <>
        <path d="M20.5 11.8a8.4 8.4 0 0 1-12.4 7.4L3 20.5l1.4-4.9a8.4 8.4 0 1 1 16.1-3.8Z" />
        <path d="M8.2 7.8c.2-.5.4-.5.7-.5h.5c.2 0 .4.1.5.4l.7 1.7c.1.2.1.4 0 .6l-.5.7c-.2.2-.2.4 0 .6.6 1 1.4 1.8 2.4 2.4.2.1.4.1.6-.1l.8-.9c.2-.2.4-.2.6-.1l1.6.8c.3.1.4.3.4.5 0 .3-.2 1.1-.7 1.5-.5.5-1.2.7-2 .5-1.2-.3-2.7-1-4.1-2.4-1.2-1.1-2-2.5-2.3-3.5-.3-1 .1-1.8.8-2.2Z" />
      </>
    ),
  },
] as const;

export function SocialLinks({ placement = "footer" }: { placement?: "footer" | "menu" }) {
  return (
    <nav className={`social-links social-links-${placement}`} aria-label="Social media">
      {socialLinks.map((link) => (
        <a
          key={link.name}
          href={link.href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={link.name}
          title={link.name}
        >
          <svg
            className={`social-icon social-icon-${link.name.toLowerCase()}`}
            viewBox="0 0 24 24"
            aria-hidden="true"
            focusable="false"
            fill={link.name === "X" ? "currentColor" : "none"}
            stroke={link.name === "X" ? "none" : "currentColor"}
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {link.icon}
          </svg>
        </a>
      ))}
    </nav>
  );
}
