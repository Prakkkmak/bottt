/** The circle's groups outside the site, linked from the header on every page. The Signal link carries the group's invitation: it is public on purpose. */
export const communityLinks = [
  { id: 'facebook', label: 'Groupe Facebook', href: 'https://www.facebook.com/groups/2160815557860833' },
  { id: 'signal', label: 'Groupe Signal', href: 'https://signal.group/#CjQKIBH-my0xKLi0JA6Zr1uG09LaYIXQAFKx5Il-z8FBO-9VEhAuQ1m1a8mUhmvkY23tVDbO' },
  { id: 'discord', label: 'Serveur Discord', href: 'https://discord.gg/36CVB2JJes' },
] as const;

export type CommunityId = typeof communityLinks[number]['id'];
