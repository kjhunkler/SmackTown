import { DEFAULT_LOADOUTS } from './profile.js';

export const TEAMS = {
  red: { name: 'Red', color: '#ff7185' },
  blue: { name: 'Blue', color: '#68caff' },
};
export const MAX_BOTS = 6;

export function smallerTeam(roster) {
  let balance = 0;
  for (const member of roster) {
    if (member.status === 'gone') continue;
    if (member.team === 'red') balance++;
    if (member.team === 'blue') balance--;
  }
  return balance <= 0 ? 'red' : 'blue';
}

export function botMember({ slot, team }) {
  const { name, color, build } = DEFAULT_LOADOUTS[slot];
  return { peerId: 'bot:' + slot, name: name + ' Bot', color, build, team, isBot: true, ready: true };
}

export function hasOpposingTeams(roster) {
  return roster.some(m => m.team === 'red') && roster.some(m => m.team === 'blue');
}
