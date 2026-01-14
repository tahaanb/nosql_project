const { runRead } = require('../services/neo4j.service');

/**
 * GET /graph
 * Retourne tous les nœuds et relations pour visualisation
 * Format compatible avec une visualisation front (ex: D3.js, vis.js, etc.)
 */
async function getGraph(req, res, next) {
  try {
    // Récupérer tous les nœuds
    const nodesCypher = `
      MATCH (n)
      WHERE n:User OR n:Role OR n:Permission OR n:Resource OR n:IP OR n:AccessAttempt
      RETURN 
        id(n) AS nodeId,
        labels(n)[0] AS label,
        properties(n) AS properties
    `;

    const nodesResult = await runRead(nodesCypher);
    const nodes = nodesResult.records.map((record) => ({
      id: record.get('nodeId').toNumber(),
      label: record.get('label'),
      properties: record.get('properties'),
    }));

    // Récupérer toutes les relations
    const relsCypher = `
      MATCH (a)-[r]->(b)
      WHERE (a:User OR a:Role OR a:Permission OR a:Resource OR a:IP OR a:AccessAttempt)
        AND (b:User OR b:Role OR b:Permission OR b:Resource OR b:IP OR b:AccessAttempt)
      RETURN 
        id(a) AS sourceId,
        id(b) AS targetId,
        type(r) AS relType
    `;

    const relsResult = await runRead(relsCypher);
    const relationships = relsResult.records.map((record) => ({
      source: record.get('sourceId').toNumber(),
      target: record.get('targetId').toNumber(),
      type: record.get('relType'),
    }));

    res.json({
      nodes,
      relationships,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getGraph,
};