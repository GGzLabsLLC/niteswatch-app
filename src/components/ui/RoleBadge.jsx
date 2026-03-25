export default function RoleBadge({ role }) {
  if (!role || role === "user") return null;

  const map = {
    moderator: {
      label: "MOD",
      className: "badge-mod",
    },
    admin: {
      label: "ADMIN",
      className: "badge-admin",
    },
  };

  const config = map[role];
  if (!config) return null;

  return (
    <span className={`role-badge ${config.className}`}>
      {config.label}
    </span>
  );
}