import { rollFateDie } from './dice.js';
import { assert } from './errors.js';
import { alivePlayers, pushLog } from './party.js';

export function openVote(state, optionIds, now, seconds) {
  state.seq.vote += 1;
  state.vote = {
    id: `v${state.seq.vote}`,
    options: optionIds,
    votes: {},
    opensAt: now,
    endsAt: now + seconds * 1000,
    closed: false,
    result: null,
  };
  return state.vote;
}

// One vote per living player; changing your mind before the close is allowed.
export function castVote(state, playerId, optionId) {
  const vote = state.vote;
  assert(vote && !vote.closed, 'vote_closed', 'The vote has already closed.');
  const player = state.players[playerId];
  assert(player && !player.fallen, 'fallen', 'The Fallen cannot vote.');
  assert(vote.options.includes(optionId), 'bad_option', 'That is not one of the choices.');
  vote.votes[playerId] = optionId;
  return { allVoted: allEligibleVoted(state) };
}

export function allEligibleVoted(state) {
  const alive = alivePlayers(state);
  return alive.length > 0 && alive.every((p) => state.vote.votes[p.id] !== undefined);
}

// The hero leads the party: their vote counts double; each companion's counts once.
export const LEADER_WEIGHT = 2;

export function tallyVotes(votes, optionIds, weightOf = () => 1) {
  const counts = Object.fromEntries(optionIds.map((id) => [id, 0]));
  for (const [playerId, optionId] of Object.entries(votes)) {
    if (optionId in counts) counts[optionId] += weightOf(playerId);
  }
  const top = Math.max(...Object.values(counts));
  const leaders = optionIds.filter((id) => counts[id] === top);
  return { counts, leaders };
}

// Closes the vote exactly once. Ties (or no votes at all) go to a server-rolled Fate Die.
export function closeVote(state, rng) {
  const vote = state.vote;
  if (!vote || vote.closed) return null;
  vote.closed = true;

  const { counts, leaders } = tallyVotes(vote.votes, vote.options, (id) => (state.players[id]?.npc ? 1 : LEADER_WEIGHT));
  let winner = leaders[0];
  let fate = null;
  if (leaders.length > 1) {
    fate = rollFateDie(rng, leaders.length);
    winner = leaders[fate.value - 1];
    pushLog(state, 'fate', `The vote is tied — the Fate Die rolls ${fate.value} of ${leaders.length}.`, { roll: fate });
  }
  vote.result = { winner, counts, fate };
  return vote.result;
}
