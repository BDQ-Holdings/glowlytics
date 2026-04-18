const { getCurrentRoutine } = require('../../queries/routine');
const { asJsonText } = require('../tool-helpers');
const schemas = require('../schemas');

function projectProduct(p) {
  return {
    productId: p.user_product_id,
    name: p.product_name,
    schedule: p.usage_schedule || null,
    startDate: p.start_date || null,
  };
}

function registerRoutineTools(server, { userId }) {
  server.registerTool(
    'get_current_routine',
    {
      title: 'Get current routine',
      description: "Return the user's active AM/PM products and any detected ingredient conflicts.",
      inputSchema: schemas.empty,
    },
    async () => {
      const r = await getCurrentRoutine(userId);
      return asJsonText({
        am: r.am.map(projectProduct),
        pm: r.pm.map(projectProduct),
        conflicts: r.conflicts,
      });
    }
  );
}

module.exports = { registerRoutineTools };
