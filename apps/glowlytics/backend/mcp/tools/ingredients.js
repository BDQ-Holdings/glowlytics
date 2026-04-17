const { lookupIngredient, searchIngredients } = require('../../queries/ingredients');
const { asJsonText } = require('../tool-helpers');
const schemas = require('../schemas');

function registerIngredientTools(server) {
  server.registerTool(
    'lookup_ingredient',
    {
      title: 'Look up ingredient',
      description: 'Look up a skincare ingredient. Returns name, aliases, function, and evidence citations (each with chunkId).',
      inputSchema: schemas.lookupIngredientInput,
    },
    async ({ name }) => asJsonText(await lookupIngredient(name))
  );

  server.registerTool(
    'search_ingredients',
    {
      title: 'Search ingredients',
      description: 'Free-text search across the ingredient knowledge base. Each result has citations with chunkId.',
      inputSchema: schemas.searchIngredientsInput,
    },
    async ({ query, limit }) => asJsonText(await searchIngredients(query, { limit }))
  );
}

module.exports = { registerIngredientTools };
