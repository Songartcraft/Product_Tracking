const { rpc, rpc2, rpc3, readSession, fail } = require('./_lib.js');

module.exports = async (req, res) => {
  try {
    const session = readSession(req);
    let categories = [];
    let shopName = 'Song Art & Craft';
    let logoUrl = '';
    try {
      const [cats, branding] = await Promise.all([rpc2('list_categories'), rpc2('get_branding')]);
      categories = cats || [];
      shopName = (branding && branding.shop_name) || shopName;
      logoUrl = (branding && branding.logo_url) || '';
    } catch (e) { /* pre-migration fallback */ }
    if (!categories.length) {
      categories = [
        { id: 'c1', name: 'Glass Flower' },
        { id: 'c2', name: 'Glass Petals' },
        { id: 'c3', name: 'Glass Artifact' },
      ];
    }

    let productCategories = [];
    try { productCategories = (await rpc3('list_product_categories')) || []; } catch (e) {}

    if (!session) {
      return res.status(200).json({
        session: null, categories, shop_name: shopName, logo_url: logoUrl,
        product_categories: productCategories,
      });
    }

    const [makers, purchases] = await Promise.all([rpc('list_makers'), rpc('list_purchases')]);
    let products = [];
    try { products = (await rpc3('list_products')) || []; } catch (e) {}

    const out = {
      session, makers, purchases, categories,
      shop_name: shopName, logo_url: logoUrl,
      product_categories: productCategories, products,
    };
    try { out.delete_requests = await rpc2('list_delete_requests'); } catch (e) { out.delete_requests = []; }
    if (session.t === 'admin') {
      out.employees = await rpc('list_employees');
      try { out.admins = await rpc2('list_admins'); } catch (e) { out.admins = []; }
    }
    res.status(200).json(out);
  } catch (e) {
    fail(res, 500, e.message || 'Failed to load');
  }
};
