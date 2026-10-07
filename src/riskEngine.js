function classifyDistance(distanceMeters) {
  if (distanceMeters <= 100) return 'very_close';
  if (distanceMeters <= 200) return 'near';
  return 'far';
}

function scoreLocation({ listingCount, nearby, veryClose, far }) {
  const riskBase = listingCount * 0.6;
  const nearbyRisk = nearby * 2.2;
  const veryCloseRisk = veryClose * 3.6;
  const farRisk = far * 0.9;
  const score = Math.min(10, Math.max(1, Math.round(riskBase + nearbyRisk + veryCloseRisk - farRisk)));

  if (score >= 7) return { score, label: 'high_risk' };
  if (score >= 4) return { score, label: 'medium_risk' };
  return { score, label: 'low_risk' };
}

module.exports = {
  classifyDistance,
  scoreLocation,
};
