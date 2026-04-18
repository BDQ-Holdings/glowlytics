'use strict';

/**
 * Curated skincare product database with full INCI ingredient lists.
 * Covers popular US brands that Open Beauty Facts often misses or has incomplete data for.
 */

const CURATED_PRODUCTS = [
  // ==================== PanOxyl ====================
  {
    name: 'PanOxyl Acne Foaming Wash 10%',
    brand: 'PanOxyl',
    barcode: '011822307246',
    ingredients: ['Benzoyl Peroxide 10%', 'Water', 'Sodium C14-16 Olefin Sulfonate', 'Cocamidopropyl Betaine', 'Glycerin', 'Sodium Chloride', 'Carbomer', 'Sodium Hydroxide', 'Disodium EDTA'],
    category: 'cleanser',
  },
  {
    name: 'PanOxyl Acne Foaming Wash 4%',
    brand: 'PanOxyl',
    barcode: '011822307239',
    ingredients: ['Benzoyl Peroxide 4%', 'Water', 'Sodium C14-16 Olefin Sulfonate', 'Cocamidopropyl Betaine', 'Glycerin', 'Sodium Chloride', 'Carbomer', 'Sodium Hydroxide', 'Disodium EDTA'],
    category: 'cleanser',
  },
  {
    name: 'PanOxyl Acne Creamy Wash',
    brand: 'PanOxyl',
    barcode: '011822307253',
    ingredients: ['Benzoyl Peroxide 4%', 'Water', 'Cetyl Alcohol', 'Stearyl Alcohol', 'Lactic Acid', 'Glycerin', 'PEG-100 Stearate', 'Glyceryl Stearate', 'Potassium Cetyl Phosphate', 'Cocamidopropyl Betaine', 'Sodium Hydroxide', 'Carbomer', 'Disodium EDTA'],
    category: 'cleanser',
  },
  {
    name: 'PanOxyl PM Overnight Spot Patches',
    brand: 'PanOxyl',
    ingredients: ['Hydrocolloid', 'Salicylic Acid', 'Niacinamide'],
    category: 'treatment',
  },
  {
    name: 'PanOxyl Anti-Microbial Acne Body Wash',
    brand: 'PanOxyl',
    ingredients: ['Benzoyl Peroxide 10%', 'Water', 'Sodium C14-16 Olefin Sulfonate', 'Cocamidopropyl Betaine', 'Glycerin', 'Acrylates Copolymer', 'Sodium Chloride', 'Sodium Hydroxide', 'Disodium EDTA'],
    category: 'cleanser',
  },

  // ==================== Byoma ====================
  {
    name: 'Byoma Moisturizing Gel Cream',
    brand: 'Byoma',
    barcode: '5060734580010',
    ingredients: ['Water', 'Glycerin', 'Caprylic/Capric Triglyceride', 'Cetearyl Alcohol', 'Cetyl Alcohol', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Niacinamide', 'Squalane', 'Sodium Hyaluronate', 'Panthenol', 'Allantoin', 'Tocopherol', 'Carbomer', 'Xanthan Gum', 'Sodium Lauroyl Lactylate', 'Sodium Hydroxide', 'Disodium EDTA', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },
  {
    name: 'Byoma Balancing Face Mist',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Niacinamide', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Panthenol', 'Allantoin', 'Sodium Lauroyl Lactylate', 'Citric Acid', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'toner',
  },
  {
    name: 'Byoma Clarifying Serum',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Niacinamide', 'Salicylic Acid', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Zinc PCA', 'Sodium Hyaluronate', 'Lactic Acid', 'Sodium Lauroyl Lactylate', 'Xanthan Gum', 'Citric Acid', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },
  {
    name: 'Byoma Hydrating Serum',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Sodium Hyaluronate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Panthenol', 'Allantoin', 'Niacinamide', 'Squalane', 'Sodium Lauroyl Lactylate', 'Carbomer', 'Sodium Hydroxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },
  {
    name: 'Byoma Creamy Jelly Cleanser',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Cocamidopropyl Betaine', 'Sodium Lauroyl Sarcosinate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Niacinamide', 'Allantoin', 'Panthenol', 'Sodium Lauroyl Lactylate', 'Citric Acid', 'Sodium Chloride', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'cleanser',
  },
  {
    name: 'Byoma Brightening Serum',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Niacinamide', 'Tranexamic Acid', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Ascorbyl Glucoside', 'Alpha-Arbutin', 'Sodium Hyaluronate', 'Sodium Lauroyl Lactylate', 'Carbomer', 'Sodium Hydroxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },
  {
    name: 'Byoma Moisturizing Cream',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Caprylic/Capric Triglyceride', 'Cetearyl Alcohol', 'Cetyl Alcohol', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Niacinamide', 'Squalane', 'Shea Butter', 'Sodium Hyaluronate', 'Panthenol', 'Allantoin', 'Tocopherol', 'Dimethicone', 'Carbomer', 'Xanthan Gum', 'Sodium Lauroyl Lactylate', 'Sodium Hydroxide', 'Disodium EDTA', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },
  {
    name: 'Byoma Moisturizing Rich Cream',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Caprylic/Capric Triglyceride', 'Cetearyl Alcohol', 'Shea Butter', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Niacinamide', 'Squalane', 'Sodium Hyaluronate', 'Panthenol', 'Allantoin', 'Tocopherol', 'Dimethicone', 'Sodium Lauroyl Lactylate', 'Carbomer', 'Sodium Hydroxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },
  {
    name: 'Byoma Moisturizing Serum',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Sodium Hyaluronate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Niacinamide', 'Panthenol', 'Allantoin', 'Squalane', 'Betaine', 'Sodium Lauroyl Lactylate', 'Carbomer', 'Sodium Hydroxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },
  {
    name: 'Byoma Sensitiv Soothing Serum',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Centella Asiatica Extract', 'Panthenol', 'Allantoin', 'Bisabolol', 'Sodium Hyaluronate', 'Sodium Lauroyl Lactylate', 'Carbomer', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },
  {
    name: 'Byoma Exfoliating Gel Cleanser',
    brand: 'Byoma',
    ingredients: ['Water', 'Glycerin', 'Cocamidopropyl Betaine', 'Salicylic Acid', 'Lactic Acid', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Niacinamide', 'Sodium Lauroyl Lactylate', 'Citric Acid', 'Sodium Chloride', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'cleanser',
  },
  {
    name: 'Byoma Lip Treatment',
    brand: 'Byoma',
    ingredients: ['Hydrogenated Polyisobutene', 'Diisostearyl Malate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Shea Butter', 'Squalane', 'Tocopherol', 'Sodium Lauroyl Lactylate', 'Phenoxyethanol'],
    category: 'lip care',
  },

  // ==================== Carmex ====================
  {
    name: 'Carmex Classic Lip Balm Medicated',
    brand: 'Carmex',
    barcode: '083078113162',
    ingredients: ['Camphor 1.7%', 'Menthol 0.7%', 'White Petrolatum 61.0%', 'Beeswax', 'Cetyl Esters', 'Cocoa Butter', 'Lanolin', 'Paraffin', 'Salicylic Acid', 'Theobroma Cacao Seed Butter', 'Flavor', 'Vanillin'],
    category: 'lip care',
  },
  {
    name: 'Carmex Healing Cream',
    brand: 'Carmex',
    ingredients: ['Water', 'Glycerin', 'Cetyl Alcohol', 'Petrolatum', 'Dimethicone', 'Cetearyl Alcohol', 'Ceramide NP', 'Colloidal Oatmeal', 'Allantoin', 'Panthenol', 'Tocopheryl Acetate', 'Sodium Hyaluronate', 'Steareth-21', 'Steareth-2', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },
  {
    name: 'Carmex Daily Care Lip Balm SPF 15',
    brand: 'Carmex',
    ingredients: ['Octinoxate 7.5%', 'Oxybenzone 4.0%', 'Petrolatum', 'Beeswax', 'Camphor', 'Menthol', 'Cocoa Butter', 'Lanolin', 'Cetyl Esters', 'Flavor'],
    category: 'lip care',
  },

  // ==================== CeraVe ====================
  {
    name: 'CeraVe Foaming Facial Cleanser',
    brand: 'CeraVe',
    barcode: '301871371054',
    ingredients: ['Water', 'Cocamidopropyl Hydroxysultaine', 'Glycerin', 'Sodium Lauroyl Sarcosinate', 'Niacinamide', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Sodium Methyl Cocoyl Taurate', 'PEG-150 Pentaerythrityl Tetrastearate', 'Propylene Glycol', 'Citric Acid', 'Sodium Chloride', 'Sodium Lauroyl Lactylate', 'Disodium EDTA', 'Methylparaben', 'Propylparaben'],
    category: 'cleanser',
  },
  {
    name: 'CeraVe Moisturizing Cream',
    brand: 'CeraVe',
    barcode: '301871371160',
    ingredients: ['Water', 'Glycerin', 'Cetearyl Alcohol', 'Caprylic/Capric Triglyceride', 'Cetyl Alcohol', 'Ceteareth-20', 'Petrolatum', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Dimethicone', 'Potassium Phosphate', 'Dipotassium Phosphate', 'Sodium Lauroyl Lactylate', 'Disodium EDTA', 'Phenoxyethanol', 'Methylparaben', 'Propylparaben', 'Carbomer', 'Xanthan Gum'],
    category: 'moisturizer',
  },
  {
    name: 'CeraVe Hydrating Facial Cleanser',
    brand: 'CeraVe',
    barcode: '301871371047',
    ingredients: ['Water', 'Glycerin', 'Cetearyl Alcohol', 'PEG-40 Stearate', 'Stearyl Alcohol', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Niacinamide', 'Behentrimonium Methosulfate', 'Ceteareth-20', 'Polysorbate 20', 'Sodium Lauroyl Lactylate', 'Disodium EDTA', 'Methylparaben', 'Propylparaben', 'Carbomer', 'Xanthan Gum'],
    category: 'cleanser',
  },
  {
    name: 'CeraVe PM Facial Moisturizing Lotion',
    brand: 'CeraVe',
    barcode: '301871371085',
    ingredients: ['Water', 'Glycerin', 'Niacinamide', 'Cetearyl Alcohol', 'Caprylic/Capric Triglyceride', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Dimethicone', 'Ceteareth-20', 'Polyglyceryl-3 Diisostearate', 'Potassium Phosphate', 'Dipotassium Phosphate', 'Sodium Lauroyl Lactylate', 'Disodium EDTA', 'Phenoxyethanol', 'Methylparaben', 'Propylparaben', 'Carbomer', 'Xanthan Gum'],
    category: 'moisturizer',
  },
  {
    name: 'CeraVe AM Facial Moisturizing Lotion SPF 30',
    brand: 'CeraVe',
    barcode: '301871371092',
    ingredients: ['Homosalate 10%', 'Meradimate 5%', 'Octinoxate 5%', 'Octocrylene 2%', 'Zinc Oxide 6.3%', 'Water', 'Glycerin', 'Niacinamide', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Dimethicone', 'Cetearyl Alcohol', 'Behentrimonium Methosulfate', 'Sodium Lauroyl Lactylate', 'Disodium EDTA', 'Phenoxyethanol'],
    category: 'moisturizer',
  },
  {
    name: 'CeraVe Renewing SA Cleanser',
    brand: 'CeraVe',
    ingredients: ['Salicylic Acid', 'Water', 'Sodium Lauroyl Sarcosinate', 'Cocamidopropyl Hydroxysultaine', 'Glycerin', 'Niacinamide', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Sodium Methyl Cocoyl Taurate', 'Sodium Chloride', 'Sodium Lauroyl Lactylate', 'Citric Acid', 'Disodium EDTA', 'Methylparaben', 'Propylparaben'],
    category: 'cleanser',
  },
  {
    name: 'CeraVe Healing Ointment',
    brand: 'CeraVe',
    ingredients: ['Petrolatum', 'Mineral Oil', 'Ceresin', 'Paraffin', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Dimethicone', 'Tocopheryl Acetate', 'Panthenol', 'Sodium Lauroyl Lactylate', 'Alumina', 'Phenoxyethanol'],
    category: 'ointment',
  },
  {
    name: 'CeraVe Hydrating Cream-to-Foam Cleanser',
    brand: 'CeraVe',
    ingredients: ['Water', 'Glycerin', 'Sodium Cocoyl Glycinate', 'Coco-Betaine', 'Disodium Cocoyl Glutamate', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Niacinamide', 'Sodium Hyaluronate', 'Amino Acid Complex', 'Sodium Lauroyl Lactylate', 'Sodium Chloride', 'Citric Acid', 'Disodium EDTA', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'cleanser',
  },
  {
    name: 'CeraVe Retinol Serum',
    brand: 'CeraVe',
    ingredients: ['Water', 'Dimethicone', 'Retinol', 'Niacinamide', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Glycerin', 'Cetearyl Alcohol', 'Ceteareth-20', 'Sodium Lauroyl Lactylate', 'Tocopheryl Acetate', 'Polysorbate 20', 'BHT', 'Disodium EDTA', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },
  {
    name: 'CeraVe Vitamin C Serum',
    brand: 'CeraVe',
    ingredients: ['Water', 'Ascorbic Acid 10%', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Sodium Hyaluronate', 'Panthenol', 'Glycerin', 'Tocopheryl Acetate', 'Dimethicone', 'Cetearyl Alcohol', 'Sodium Lauroyl Lactylate', 'Citric Acid', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },

  // ==================== The Ordinary ====================
  {
    name: 'The Ordinary Niacinamide 10% + Zinc 1%',
    brand: 'The Ordinary',
    barcode: '769915190585',
    ingredients: ['Water', 'Niacinamide', 'Zinc PCA', 'Dimethyl Isosorbide', 'Tamarindus Indica Seed Gum', 'Decyl Glucoside', 'Isoceteth-20', 'Ethoxydiglycol', 'Pentylene Glycol', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'serum',
  },
  {
    name: 'The Ordinary Hyaluronic Acid 2% + B5',
    brand: 'The Ordinary',
    barcode: '769915190257',
    ingredients: ['Water', 'Sodium Hyaluronate', 'Panthenol', 'Ahnfeltia Concinna Extract', 'Glycerin', 'Pentylene Glycol', 'Propanediol', 'Sodium Hyaluronate Crosspolymer', 'PPG-26-Buteth-26', 'PEG-40 Hydrogenated Castor Oil', 'Trisodium Ethylenediamine Disuccinate', 'Citric Acid', 'Ethoxydiglycol', 'Caprylyl Glycol', 'Hexylene Glycol', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'serum',
  },
  {
    name: 'The Ordinary Retinol 0.5% in Squalane',
    brand: 'The Ordinary',
    barcode: '769915190547',
    ingredients: ['Squalane', 'Caprylic/Capric Triglyceride', 'Retinol', 'Solanum Lycopersicum Fruit Extract', 'Simmondsia Chinensis Seed Oil', 'BHT', 'Rosmarinus Officinalis Leaf Extract'],
    category: 'serum',
  },
  {
    name: 'The Ordinary Retinol 1% in Squalane',
    brand: 'The Ordinary',
    ingredients: ['Squalane', 'Caprylic/Capric Triglyceride', 'Retinol', 'Solanum Lycopersicum Fruit Extract', 'Simmondsia Chinensis Seed Oil', 'BHT', 'Rosmarinus Officinalis Leaf Extract'],
    category: 'serum',
  },
  {
    name: 'The Ordinary Glycolic Acid 7% Toning Solution',
    brand: 'The Ordinary',
    barcode: '769915190349',
    ingredients: ['Water', 'Glycolic Acid', 'Rosa Damascena Flower Water', 'Centaurea Cyanus Flower Water', 'Aloe Barbadensis Leaf Water', 'Propanediol', 'Glycerin', 'Triethanolamine', 'Aminomethyl Propanol', 'Panthenol', 'Sodium Hyaluronate Crosspolymer', 'Tasmannia Lanceolata Fruit/Leaf Extract', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'toner',
  },
  {
    name: 'The Ordinary AHA 30% + BHA 2% Peeling Solution',
    brand: 'The Ordinary',
    barcode: '769915190639',
    ingredients: ['Glycolic Acid', 'Water', 'Lactic Acid', 'Tartaric Acid', 'Citric Acid', 'Salicylic Acid', 'Daucus Carota Sativa Root Extract', 'Propanediol', 'Hydroxyethylcellulose', 'Triethanolamine', 'Panthenol', 'Sodium Hyaluronate Crosspolymer', 'Tasmannia Lanceolata Fruit/Leaf Extract', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'treatment',
  },
  {
    name: 'The Ordinary Salicylic Acid 2% Solution',
    brand: 'The Ordinary',
    ingredients: ['Water', 'Salicylic Acid', 'Cocamidopropyl Dimethylamine', 'Hydroxyethylcellulose', 'Propanediol', 'Dimethyl Isosorbide', 'Ethoxydiglycol', 'Polysorbate 20', 'Citric Acid', 'Pentylene Glycol', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'serum',
  },
  {
    name: 'The Ordinary Azelaic Acid Suspension 10%',
    brand: 'The Ordinary',
    barcode: '769915190691',
    ingredients: ['Water', 'Azelaic Acid', 'Dimethicone', 'Dimethicone/Bis-Isobutyl PPG-20 Crosspolymer', 'Dimethyl Isosorbide', 'Hydroxyethyl Acrylate/Sodium Acryloyldimethyl Taurate Copolymer', 'Polysilicone-11', 'Isohexadecane', 'Tocopherol', 'Polysorbate 60', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'treatment',
  },
  {
    name: 'The Ordinary Squalane Cleanser',
    brand: 'The Ordinary',
    ingredients: ['Squalane', 'Aqua/Water', 'Cetyl Ethylhexanoate', 'Sucrose Stearate', 'Ethyl Macadamiate', 'Caprylic/Capric Triglyceride', 'Sorbitan Laurate', 'Sorbitan Palmitate', 'Glycerin', 'Sucrose Laurate', 'Sucrose Dilaurate', 'Sucrose Trilaurate', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Chlorphenesin'],
    category: 'cleanser',
  },
  {
    name: 'The Ordinary Caffeine Solution 5% + EGCG',
    brand: 'The Ordinary',
    ingredients: ['Water', 'Caffeine', 'Epigallocatechin Gallatyl Glucoside', 'Glycerin', 'Propanediol', 'Maltodextrin', 'Galactoarabinan', 'Hyaluronic Acid', 'Oxidized Glutathione', 'Melanin', 'Hydroxypropyl Cyclodextrin', 'Pentylene Glycol', 'Dimethyl Isosorbide', 'PPG-26-Buteth-26', 'PEG-40 Hydrogenated Castor Oil', 'Citric Acid', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'serum',
  },
  {
    name: 'The Ordinary Alpha Arbutin 2% + HA',
    brand: 'The Ordinary',
    ingredients: ['Water', 'Alpha-Arbutin', 'Sodium Hyaluronate', 'Propanediol', 'PPG-26-Buteth-26', 'PEG-40 Hydrogenated Castor Oil', 'Lactic Acid/Glycolic Acid Copolymer', 'Dimethyl Isosorbide', 'Ethoxydiglycol', 'Polysorbate 20', 'Trisodium Ethylenediamine Disuccinate', 'Pentylene Glycol', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'serum',
  },
  {
    name: 'The Ordinary Natural Moisturizing Factors + HA',
    brand: 'The Ordinary',
    ingredients: ['Water', 'Caprylic/Capric Triglyceride', 'Cetyl Alcohol', 'Cetearyl Isononanoate', 'Glycerin', 'Sodium Hyaluronate', 'Arginine', 'Aspartic Acid', 'Glycine', 'Alanine', 'Serine', 'Valine', 'Isoleucine', 'Proline', 'Threonine', 'Histidine', 'Phenylalanine', 'PCA', 'Sodium PCA', 'Urea', 'Allantoin', 'Trehalose', 'Polyquaternium-51', 'Sodium Lactate', 'Ceteareth-20', 'Cetearyl Alcohol', 'Dimethicone', 'Isocetyl Stearoyl Stearate', 'Behentrimonium Methosulfate', 'Polysorbate 60', 'Sorbitan Stearate', 'Sodium Chloride', 'Sodium Hydroxide', 'Citric Acid', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'moisturizer',
  },

  // ==================== Neutrogena ====================
  {
    name: 'Neutrogena Hydro Boost Water Gel',
    brand: 'Neutrogena',
    barcode: '070501110331',
    ingredients: ['Water', 'Dimethicone', 'Glycerin', 'Dimethicone/Vinyl Dimethicone Crosspolymer', 'Sodium Hyaluronate', 'Polyacrylamide', 'Cetearyl Olivate', 'Sorbitan Olivate', 'Phenoxyethanol', 'C13-14 Isoparaffin', 'Dimethiconol', 'Chlorphenesin', 'Ceteareth-20', 'Laureth-7', 'Carbomer', 'Ethylhexylglycerin', 'Sodium Hydroxide'],
    category: 'moisturizer',
  },
  {
    name: 'Neutrogena Ultra Sheer Dry-Touch SPF 55',
    brand: 'Neutrogena',
    barcode: '086800687320',
    ingredients: ['Avobenzone 3%', 'Homosalate 10%', 'Octisalate 5%', 'Octocrylene 2.8%', 'Oxybenzone 6%', 'Water', 'Styrene/Acrylates Copolymer', 'Silica', 'Dimethicone', 'Diethylhexyl 2,6-Naphthalate', 'Glyceryl Stearate', 'PEG-100 Stearate', 'Tocopheryl Acetate', 'BHT', 'Acrylates/Dimethicone Copolymer', 'Disodium EDTA', 'Phenoxyethanol', 'Methylparaben'],
    category: 'sunscreen',
  },
  {
    name: 'Neutrogena Stubborn Acne AM Treatment',
    brand: 'Neutrogena',
    ingredients: ['Benzoyl Peroxide 2.5%', 'Water', 'Glycerin', 'Dimethicone', 'Cetearyl Alcohol', 'Niacinamide', 'Salicylic Acid', 'Aloe Barbadensis Leaf Juice', 'Tocopheryl Acetate', 'Ceteareth-20', 'Carbomer', 'Sodium Hydroxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'treatment',
  },
  {
    name: 'Neutrogena Oil-Free Acne Wash',
    brand: 'Neutrogena',
    ingredients: ['Salicylic Acid 2%', 'Water', 'Sodium C14-16 Olefin Sulfonate', 'Cocamidopropyl Betaine', 'Sodium Chloride', 'PEG-80 Sorbitan Laurate', 'C12-15 Alkyl Lactate', 'Cocamide MEA', 'Disodium EDTA', 'Aloe Barbadensis Leaf Extract', 'Anthemis Nobilis Flower Extract', 'Chamomilla Recutita Flower Extract', 'Citric Acid', 'Yellow 5', 'Red 40'],
    category: 'cleanser',
  },
  {
    name: 'Neutrogena Rapid Wrinkle Repair Retinol Cream',
    brand: 'Neutrogena',
    ingredients: ['Water', 'Glycerin', 'Dimethicone', 'Retinol SA', 'Glucose Complex', 'Hyaluronic Acid', 'Cetearyl Alcohol', 'Ceteareth-20', 'PEG-100 Stearate', 'Glyceryl Stearate', 'Tocopheryl Acetate', 'BHT', 'Carbomer', 'Sodium Hydroxide', 'Disodium EDTA', 'Phenoxyethanol', 'Methylparaben'],
    category: 'moisturizer',
  },

  // ==================== La Roche-Posay ====================
  {
    name: 'La Roche-Posay Anthelios Melt-In Sunscreen SPF 60',
    brand: 'La Roche-Posay',
    barcode: '883140500773',
    ingredients: ['Avobenzone 3%', 'Homosalate 15%', 'Octisalate 5%', 'Octocrylene 7%', 'Water', 'Glycerin', 'Silica', 'Isopropyl Myristate', 'Stearic Acid', 'Triethanolamine', 'Dimethicone', 'PEG-100 Stearate', 'Glyceryl Stearate', 'Phenoxyethanol', 'Tocopherol', 'Sodium Stearoyl Glutamate', 'Disodium EDTA'],
    category: 'sunscreen',
  },
  {
    name: 'La Roche-Posay Toleriane Hydrating Gentle Cleanser',
    brand: 'La Roche-Posay',
    barcode: '883140500902',
    ingredients: ['Water', 'Glycerin', 'Pentaerythrityl Tetraethylhexanoate', 'Niacinamide', 'Propylene Glycol', 'Ceramide NP', 'Coco-Betaine', 'Sodium Methyl Cocoyl Taurate', 'Acrylates/C10-30 Alkyl Acrylate Crosspolymer', 'Sodium Hydroxide', 'Disodium EDTA', 'Panthenol', 'Tocopherol', 'Sodium Chloride', 'Citric Acid'],
    category: 'cleanser',
  },
  {
    name: 'La Roche-Posay Effaclar Duo Acne Treatment',
    brand: 'La Roche-Posay',
    ingredients: ['Benzoyl Peroxide 5.5%', 'Water', 'Glycerin', 'Dimethicone', 'Niacinamide', 'Lipo Hydroxy Acid', 'Linoleic Acid', 'Ceramide NP', 'Carbomer', 'Sodium Hydroxide', 'Disodium EDTA', 'Phenoxyethanol'],
    category: 'treatment',
  },
  {
    name: 'La Roche-Posay Cicaplast Baume B5+',
    brand: 'La Roche-Posay',
    ingredients: ['Water', 'Hydrogenated Polyisobutene', 'Dimethicone', 'Glycerin', 'Panthenol', 'Butyrospermum Parkii Butter', 'Propanediol', 'Cetearyl Alcohol', 'Aluminum Starch Octenylsuccinate', 'Madecassoside', 'Manganese Gluconate', 'Copper Gluconate', 'Zinc Gluconate', 'Tristearin', 'Sodium Lauroyl Lactylate', 'Citric Acid', 'Disodium EDTA', 'Phenoxyethanol'],
    category: 'moisturizer',
  },
  {
    name: 'La Roche-Posay Anthelios Mineral SPF 50',
    brand: 'La Roche-Posay',
    ingredients: ['Titanium Dioxide 6%', 'Zinc Oxide 5%', 'Water', 'Isododecane', 'Glycerin', 'Aluminum Starch Octenylsuccinate', 'Niacinamide', 'Dimethicone', 'Styrene/Acrylates Copolymer', 'PEG-30 Dipolyhydroxystearate', 'Silica', 'Phenoxyethanol', 'Tocopherol', 'Disodium EDTA'],
    category: 'sunscreen',
  },

  // ==================== Differin ====================
  {
    name: 'Differin Adapalene Gel 0.1%',
    brand: 'Differin',
    barcode: '302993889182',
    ingredients: ['Adapalene 0.1%', 'Water', 'Carbomer 940', 'Edetate Disodium', 'Methylparaben', 'Poloxamer 182', 'Propylene Glycol', 'Sodium Hydroxide'],
    category: 'treatment',
  },
  {
    name: 'Differin Daily Deep Cleanser',
    brand: 'Differin',
    ingredients: ['Benzoyl Peroxide 5%', 'Water', 'Sodium C14-16 Olefin Sulfonate', 'Cocamidopropyl Betaine', 'Glycerin', 'Acrylates Copolymer', 'Sodium Chloride', 'Sodium Hydroxide', 'Disodium EDTA'],
    category: 'cleanser',
  },
  {
    name: 'Differin Oil Absorbing Moisturizer SPF 30',
    brand: 'Differin',
    ingredients: ['Avobenzone 2.5%', 'Octisalate 4.5%', 'Octocrylene 5%', 'Water', 'Glycerin', 'Dimethicone', 'Niacinamide', 'Silica', 'Cetearyl Alcohol', 'PEG-100 Stearate', 'Glyceryl Stearate', 'Allantoin', 'Carbomer', 'Sodium Hydroxide', 'Disodium EDTA', 'Phenoxyethanol'],
    category: 'moisturizer',
  },

  // ==================== Paula's Choice ====================
  {
    name: "Paula's Choice Skin Perfecting 2% BHA Liquid Exfoliant",
    brand: "Paula's Choice",
    barcode: '655439077101',
    ingredients: ['Water', 'Methylpropanediol', 'Butylene Glycol', 'Salicylic Acid', 'Polysorbate 20', 'Green Tea Extract', 'Methylparaben', 'Sodium Hydroxide', 'Tetrasodium EDTA'],
    category: 'exfoliant',
  },
  {
    name: "Paula's Choice 10% Azelaic Acid Booster",
    brand: "Paula's Choice",
    ingredients: ['Water', 'Azelaic Acid', 'C12-15 Alkyl Benzoate', 'Caprylic/Capric Triglyceride', 'Methyl Glucose Sesquistearate', 'Glycerin', 'Cetearyl Alcohol', 'Salicylic Acid', 'Adenosine', 'Allantoin', 'Boerhavia Diffusa Root Extract', 'Glycyrrhiza Glabra Root Extract', 'Dimethicone', 'Ceteareth-20', 'Xanthan Gum', 'Phenoxyethanol'],
    category: 'treatment',
  },
  {
    name: "Paula's Choice C15 Super Booster",
    brand: "Paula's Choice",
    ingredients: ['Water', 'Ascorbic Acid 15%', 'Butylene Glycol', 'Ethoxydiglycol', 'Glycerin', 'Tocopherol', 'Panthenol', 'Ferulic Acid', 'PPG-26-Buteth-26', 'PEG-40 Hydrogenated Castor Oil', 'Sodium Hydroxide', 'Phenoxyethanol'],
    category: 'serum',
  },

  // ==================== Vanicream ====================
  {
    name: 'Vanicream Gentle Facial Cleanser',
    brand: 'Vanicream',
    barcode: '345334021200',
    ingredients: ['Water', 'Glycerin', 'Sodium Cocoyl Glycinate', 'Sodium Cocoyl Isethionate', 'Coco-Betaine', 'Sodium Chloride', 'Disodium Phosphate', 'Citric Acid'],
    category: 'cleanser',
  },
  {
    name: 'Vanicream Moisturizing Skin Cream',
    brand: 'Vanicream',
    barcode: '345334021101',
    ingredients: ['Water', 'White Petrolatum', 'Sorbitol', 'Cetearyl Alcohol', 'Propylene Glycol', 'Ceteareth-20', 'Simethicone', 'Glyceryl Monostearate', 'PEG-30 Dipolyhydroxystearate', 'Sorbic Acid', 'BHT'],
    category: 'moisturizer',
  },
  {
    name: 'Vanicream Daily Facial Moisturizer',
    brand: 'Vanicream',
    ingredients: ['Water', 'Squalane', 'Pentylene Glycol', 'Glycerin', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Hyaluronic Acid', 'Sorbitan Olivate', 'Cetearyl Olivate', 'Polyglyceryl-6 Distearate', 'Jojoba Esters', 'Polyhydroxystearic Acid', 'Polyglyceryl-3 Polyricinoleate', 'Sodium Chloride'],
    category: 'moisturizer',
  },

  // ==================== EltaMD ====================
  {
    name: 'EltaMD UV Clear SPF 46',
    brand: 'EltaMD',
    barcode: '827854002840',
    ingredients: ['Zinc Oxide 9%', 'Octinoxate 7.5%', 'Water', 'Niacinamide', 'Hyaluronic Acid', 'Lactic Acid', 'Oleth-3 Phosphate', 'Dimethicone', 'Cyclomethicone', 'Glyceryl Stearate', 'PEG-100 Stearate', 'Tocopheryl Acetate', 'Purified Water', 'Phenoxyethanol', 'BHT', 'Iodopropynyl Butylcarbamate', 'Sodium Hydroxide'],
    category: 'sunscreen',
  },
  {
    name: 'EltaMD UV Daily SPF 40',
    brand: 'EltaMD',
    ingredients: ['Zinc Oxide 9%', 'Water', 'Hyaluronic Acid', 'Glycerin', 'Dimethicone', 'Cetearyl Olivate', 'Sorbitan Olivate', 'C12-15 Alkyl Benzoate', 'Tocopheryl Acetate', 'Phenoxyethanol', 'Sodium Hydroxide'],
    category: 'sunscreen',
  },
  {
    name: 'EltaMD UV Sport SPF 50',
    brand: 'EltaMD',
    ingredients: ['Zinc Oxide 9%', 'Octinoxate 7.5%', 'Octisalate 5%', 'Water', 'C12-15 Alkyl Benzoate', 'Dimethicone', 'Cyclomethicone', 'Glyceryl Stearate', 'PEG-100 Stearate', 'Phenoxyethanol', 'Tocopheryl Acetate'],
    category: 'sunscreen',
  },

  // ==================== Cetaphil ====================
  {
    name: 'Cetaphil Gentle Skin Cleanser',
    brand: 'Cetaphil',
    barcode: '302993927167',
    ingredients: ['Water', 'Cetyl Alcohol', 'Propylene Glycol', 'Sodium Lauryl Sulfate', 'Stearyl Alcohol', 'Methylparaben', 'Propylparaben', 'Butylparaben'],
    category: 'cleanser',
  },
  {
    name: 'Cetaphil Daily Facial Moisturizer SPF 15',
    brand: 'Cetaphil',
    ingredients: ['Avobenzone 3%', 'Octinoxate 7.5%', 'Water', 'Glycerin', 'Dimethicone', 'Diisopropyl Sebacate', 'Hydroxyethyl Acrylate/Sodium Acryloyldimethyl Taurate Copolymer', 'Glyceryl Stearate', 'PEG-100 Stearate', 'Tocopheryl Acetate', 'Macadamia Nut Oil', 'Sweet Almond Oil', 'Phenoxyethanol', 'Benzyl Alcohol', 'Disodium EDTA'],
    category: 'moisturizer',
  },
  {
    name: 'Cetaphil Moisturizing Cream',
    brand: 'Cetaphil',
    ingredients: ['Water', 'Glycerin', 'Petrolatum', 'Dicaprylyl Ether', 'Dimethicone', 'Glyceryl Stearate', 'Cetyl Alcohol', 'Prunus Amygdalus Dulcis Oil', 'PEG-30 Stearate', 'Panthenol', 'Niacinamide', 'Tocopheryl Acetate', 'Dimethiconol', 'Phenoxyethanol', 'Acrylates/C10-30 Alkyl Acrylate Crosspolymer', 'Benzyl Alcohol', 'Citric Acid', 'Disodium EDTA'],
    category: 'moisturizer',
  },

  // ==================== Eucerin ====================
  {
    name: 'Eucerin Original Healing Cream',
    brand: 'Eucerin',
    barcode: '072140634179',
    ingredients: ['Water', 'Petrolatum', 'Mineral Oil', 'Ceresin', 'Lanolin Alcohol', 'Methylchloroisothiazolinone', 'Methylisothiazolinone'],
    category: 'moisturizer',
  },
  {
    name: 'Eucerin Advanced Repair Cream',
    brand: 'Eucerin',
    ingredients: ['Water', 'Glycerin', 'Urea', 'Cetearyl Alcohol', 'Caprylic/Capric Triglyceride', 'Ceramide NP', 'Gluco-Glycerol', 'Dimethicone', 'Glyceryl Stearate SE', 'Sunflower Seed Oil', 'Sodium Lactate', 'Sodium Hyaluronate', 'PEG-40 Stearate', 'Carbomer', 'Sodium Hydroxide', 'Lactic Acid', 'Phenoxyethanol', 'Benzyl Alcohol'],
    category: 'moisturizer',
  },

  // ==================== Aveeno ====================
  {
    name: 'Aveeno Daily Moisturizing Lotion',
    brand: 'Aveeno',
    barcode: '381370036005',
    ingredients: ['Water', 'Glycerin', 'Distearyldimonium Chloride', 'Petrolatum', 'Isopropyl Palmitate', 'Cetyl Alcohol', 'Dimethicone', 'Avena Sativa Kernel Flour', 'Benzyl Alcohol', 'Sodium Chloride'],
    category: 'moisturizer',
  },
  {
    name: 'Aveeno Calm + Restore Oat Gel Moisturizer',
    brand: 'Aveeno',
    ingredients: ['Water', 'Glycerin', 'Dimethicone', 'Isohexadecane', 'Avena Sativa Kernel Extract', 'Feverfew Extract', 'Niacinamide', 'Ceramide NP', 'Turmeric Root Extract', 'Aloe Barbadensis Leaf Juice', 'Glyceryl Stearate', 'PEG-100 Stearate', 'Cetearyl Alcohol', 'Carbomer', 'Sodium Hydroxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },

  // ==================== First Aid Beauty ====================
  {
    name: 'First Aid Beauty Ultra Repair Cream',
    brand: 'First Aid Beauty',
    barcode: '818367010015',
    ingredients: ['Water', 'Stearic Acid', 'Glycerin', 'C12-15 Alkyl Benzoate', 'Caprylic/Capric Triglyceride', 'Glyceryl Stearate SE', 'Cetearyl Alcohol', 'Colloidal Oatmeal', 'Shea Butter', 'Ceramide NP', 'Allantoin', 'Dimethicone', 'Squalane', 'Phenoxyethanol', 'Caprylyl Glycol', 'Chrysanthemum Parthenium Extract', 'Eucalyptus Globulus Leaf Extract'],
    category: 'moisturizer',
  },
  {
    name: 'First Aid Beauty Face Cleanser',
    brand: 'First Aid Beauty',
    ingredients: ['Water', 'Glycerin', 'Stearic Acid', 'Myristic Acid', 'Potassium Hydroxide', 'Sorbitol', 'Cocamidopropyl Betaine', 'Aloe Barbadensis Leaf Juice', 'Allantoin', 'Chrysanthemum Parthenium Extract', 'Camellia Sinensis Leaf Extract', 'Glycyrrhiza Glabra Root Extract', 'Phenoxyethanol', 'Caprylyl Glycol'],
    category: 'cleanser',
  },

  // ==================== Drunk Elephant ====================
  {
    name: 'Drunk Elephant Protini Polypeptide Cream',
    brand: 'Drunk Elephant',
    ingredients: ['Water', 'Glycerin', 'Isomalt', 'Cetearyl Alcohol', 'Cetearyl Olivate', 'Sorbitan Olivate', 'Dicaprylyl Carbonate', 'Acetyl Hexapeptide-8', 'Copper Tripeptide-1', 'Palmitoyl Tetrapeptide-7', 'Palmitoyl Tripeptide-1', 'Palmitoyl Tripeptide-38', 'Soybean Folic Acid Ferment Extract', 'Acetyl Glutamine', 'SH-Polypeptide-15', 'Pygmy Waterlily Stem Cell Extract', 'Sodium Hyaluronate Crosspolymer', 'Sclerocarya Birrea Seed Oil', 'Chrondrus Crispus Extract', 'Jojoba Esters', 'Ceteareth-20', 'Dimethicone', 'Phenoxyethanol', 'Caprylyl Glycol'],
    category: 'moisturizer',
  },
  {
    name: 'Drunk Elephant C-Firma Fresh Serum',
    brand: 'Drunk Elephant',
    ingredients: ['Water', 'Ascorbic Acid 15%', 'Glycerin', 'Laureth-23', 'Ceteareth-20', 'Sodium Hyaluronate', 'Ferulic Acid', 'Tocopherol', 'Pumpkin Ferment Extract', 'Pomegranate Extract', 'Sclerocarya Birrea Seed Oil', 'Phenoxyethanol', 'Caprylyl Glycol'],
    category: 'serum',
  },
  {
    name: 'Drunk Elephant T.L.C. Sukari Babyfacial',
    brand: 'Drunk Elephant',
    ingredients: ['Water', 'Glycolic Acid', 'Lactic Acid', 'Tartaric Acid', 'Citric Acid', 'Salicylic Acid', 'Diglucosyl Gallic Acid', 'Sclerocarya Birrea Seed Oil', 'Sodium Hyaluronate Crosspolymer', 'Citrullus Lanatus Seed Oil', 'Passiflora Edulis Seed Oil', 'Glycerin', 'Hydroxyethylcellulose', 'Sodium Hydroxide', 'Phenoxyethanol', 'Caprylyl Glycol'],
    category: 'treatment',
  },

  // ==================== Kiehl's ====================
  {
    name: "Kiehl's Ultra Facial Cream",
    brand: "Kiehl's",
    ingredients: ['Water', 'Glycerin', 'Cyclohexasiloxane', 'Squalane', 'Bis-PEG-18 Methyl Ether Dimethyl Silane', 'Sucrose Stearate', 'Stearyl Alcohol', 'PEG-8 Stearate', 'Glyceryl Stearate', 'Imperata Cylindrica Root Extract', 'Trehalose', 'Prunus Persica Kernel Extract', 'Desmodium Gangeticum Leaf/Stem Extract', 'Phenoxyethanol', 'Disodium EDTA', 'Methylparaben', 'Propylparaben'],
    category: 'moisturizer',
  },
  {
    name: "Kiehl's Clearly Corrective Dark Spot Solution",
    brand: "Kiehl's",
    ingredients: ['Water', 'Propylene Glycol', 'Glycerin', 'Ascorbyl Glucoside', 'Salicylic Acid', 'Birch Sap', 'Peony Root Extract', 'White Birch Extract', 'Phenoxyethanol', 'Chlorphenesin'],
    category: 'serum',
  },

  // ==================== Tatcha ====================
  {
    name: 'Tatcha The Dewy Skin Cream',
    brand: 'Tatcha',
    ingredients: ['Water', 'Glycerin', 'Squalane', 'Dimethicone', 'Propanediol', 'Cetearyl Alcohol', 'Oryza Sativa Bran Extract', 'Algae Extract', 'Camellia Sinensis Leaf Extract', 'Uji Green Tea Extract', 'Hyaluronic Acid', 'Botanical Blend', 'Ceramide NP', 'Ceteareth-20', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },
  {
    name: 'Tatcha The Water Cream',
    brand: 'Tatcha',
    ingredients: ['Water', 'Glycerin', 'Dimethicone', 'Squalane', 'Diphenylsiloxy Phenyl Trimethicone', 'Oryza Sativa Bran Extract', 'Algae Extract', 'Camellia Sinensis Leaf Extract', 'Niacinamide', 'Wild Rose Extract', 'Leopard Lily Extract', 'Sodium Hyaluronate', 'Cetearyl Alcohol', 'Ceteareth-20', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },

  // ==================== Supergoop ====================
  {
    name: 'Supergoop Unseen Sunscreen SPF 40',
    brand: 'Supergoop',
    ingredients: ['Avobenzone 3%', 'Homosalate 8%', 'Octisalate 5%', 'Octocrylene 4%', 'Dimethicone', 'Dimethicone/Vinyl Dimethicone Crosspolymer', 'Isododecane', 'Silica', 'C12-15 Alkyl Benzoate', 'Meadowfoam Seed Oil', 'Frankincense Extract', 'Red Algae Extract', 'Tocopheryl Acetate', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'sunscreen',
  },
  {
    name: 'Supergoop Glowscreen SPF 40',
    brand: 'Supergoop',
    ingredients: ['Avobenzone 3%', 'Homosalate 10%', 'Octisalate 5%', 'Octocrylene 6%', 'Water', 'Glycerin', 'Dimethicone', 'Niacinamide', 'Hyaluronic Acid', 'Sea Lavender Extract', 'Cocoa Peptides', 'C12-15 Alkyl Benzoate', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Iron Oxides'],
    category: 'sunscreen',
  },

  // ==================== Versed ====================
  {
    name: 'Versed Dew Point Moisturizing Gel-Cream',
    brand: 'Versed',
    ingredients: ['Water', 'Glycerin', 'Aloe Barbadensis Leaf Juice', 'Sodium Hyaluronate', 'Green Tea Extract', 'Squalane', 'Cetearyl Olivate', 'Sorbitan Olivate', 'Dimethicone', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Carbomer', 'Sodium Hydroxide'],
    category: 'moisturizer',
  },
  {
    name: 'Versed Day Dissolve Cleansing Balm',
    brand: 'Versed',
    ingredients: ['Ethylhexyl Palmitate', 'PEG-20 Glyceryl Triisostearate', 'Caprylic/Capric Triglyceride', 'Sorbeth-30 Tetraoleate', 'Sucrose Cocoate', 'Camellia Oleifera Seed Oil', 'Tocopheryl Acetate', 'Papaya Fruit Extract', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'cleanser',
  },

  // ==================== Good Molecules ====================
  {
    name: 'Good Molecules Discoloration Correcting Serum',
    brand: 'Good Molecules',
    ingredients: ['Water', 'Tranexamic Acid', 'Niacinamide', 'Alpha-Arbutin', 'Sodium Hyaluronate', 'Glycerin', 'Propanediol', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Xanthan Gum', 'Citric Acid'],
    category: 'serum',
  },
  {
    name: 'Good Molecules Hyaluronic Acid Serum',
    brand: 'Good Molecules',
    ingredients: ['Water', 'Sodium Hyaluronate', 'Glycerin', 'Propanediol', 'Panthenol', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Citric Acid'],
    category: 'serum',
  },

  // ==================== COSRX ====================
  {
    name: 'COSRX Advanced Snail 96 Mucin Power Essence',
    brand: 'COSRX',
    barcode: '8809416470252',
    ingredients: ['Snail Secretion Filtrate', 'Betaine', 'Butylene Glycol', 'Sodium Hyaluronate', 'Panthenol', 'Arginine', 'Allantoin', 'Ethyl Hexanediol', '1,2-Hexanediol', 'Carbomer', 'Phenoxyethanol'],
    category: 'essence',
  },
  {
    name: 'COSRX BHA Blackhead Power Liquid',
    brand: 'COSRX',
    ingredients: ['Salix Alba Bark Water', 'Butylene Glycol', 'Betaine Salicylate', 'Niacinamide', 'Sodium Hyaluronate', 'Panthenol', 'Camellia Sinensis Leaf Extract', 'Salix Alba Bark Extract', '1,2-Hexanediol', 'Arginine', 'Ethyl Hexanediol', 'Polysorbate 60'],
    category: 'exfoliant',
  },
  {
    name: 'COSRX AHA/BHA Clarifying Treatment Toner',
    brand: 'COSRX',
    ingredients: ['Mineral Water', 'Salix Alba Bark Water', 'Butylene Glycol', 'Glycolic Acid', 'Betaine Salicylate', 'Niacinamide', 'Sodium Hyaluronate', 'Allantoin', 'Panthenol', '1,2-Hexanediol', 'Ethyl Hexanediol'],
    category: 'toner',
  },

  // ==================== Hero Cosmetics ====================
  {
    name: 'Hero Cosmetics Mighty Patch Original',
    brand: 'Hero Cosmetics',
    barcode: '850012075003',
    ingredients: ['Hydrocolloid', 'Cellulose Gum', 'Polyisobutylene', 'Styrene-Isoprene-Styrene Block Copolymer'],
    category: 'treatment',
  },

  // ==================== Aquaphor ====================
  {
    name: 'Aquaphor Healing Ointment',
    brand: 'Aquaphor',
    barcode: '072140004200',
    ingredients: ['Petrolatum 41%', 'Mineral Oil', 'Ceresin', 'Lanolin Alcohol', 'Panthenol', 'Glycerin', 'Bisabolol'],
    category: 'ointment',
  },

  // ==================== Skinfix ====================
  {
    name: 'Skinfix Barrier+ Triple Lipid-Peptide Cream',
    brand: 'Skinfix',
    ingredients: ['Water', 'Glycerin', 'C12-15 Alkyl Benzoate', 'Caprylic/Capric Triglyceride', 'Dimethicone', 'Cetearyl Alcohol', 'Ceramide NP', 'Ceramide AP', 'Ceramide EOP', 'Phytosphingosine', 'Cholesterol', 'Palmitoyl Tripeptide-1', 'Palmitoyl Tetrapeptide-7', 'Allantoin', 'Colloidal Oatmeal', 'Shea Butter', 'Sodium Hyaluronate', 'Squalane', 'Ceteareth-20', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },

  // ==================== Youth To The People ====================
  {
    name: 'Youth To The People Superfood Cleanser',
    brand: 'Youth To The People',
    ingredients: ['Water', 'Sodium Cocoyl Glutamate', 'Cocamidopropyl Hydroxysultaine', 'Acrylates Copolymer', 'Glycerin', 'Spinacia Oleracea Leaf Extract', 'Brassica Oleracea Italica Extract', 'Camellia Sinensis Leaf Extract', 'Medicago Sativa Extract', 'Aloe Barbadensis Leaf Juice', 'Panthenol', 'Sodium Hydroxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'cleanser',
  },
  {
    name: 'Youth To The People Superfood Air-Whip Moisture Cream',
    brand: 'Youth To The People',
    ingredients: ['Water', 'Glycerin', 'Squalane', 'Caprylic/Capric Triglyceride', 'Cetearyl Alcohol', 'Hyaluronic Acid', 'Spinacia Oleracea Leaf Extract', 'Camellia Sinensis Leaf Extract', 'Aloe Barbadensis Leaf Juice', 'Vitamin E', 'Vitamin C', 'Ceteareth-20', 'Dimethicone', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'moisturizer',
  },

  // ==================== Glow Recipe ====================
  {
    name: 'Glow Recipe Watermelon Glow Niacinamide Dew Drops',
    brand: 'Glow Recipe',
    ingredients: ['Water', 'Glycerin', 'Niacinamide', 'Propanediol', 'Dimethicone', 'Watermelon Extract', 'Sodium Hyaluronate', 'Moringa Seed Oil', 'Betaine', 'Allantoin', 'Mica', 'Tin Oxide', 'Titanium Dioxide', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },
  {
    name: 'Glow Recipe Watermelon Glow PHA + BHA Pore-Tight Toner',
    brand: 'Glow Recipe',
    ingredients: ['Water', 'Gluconolactone', 'Betaine Salicylate', 'Watermelon Extract', 'Cactus Extract', 'Sodium Hyaluronate', 'Niacinamide', 'Glycerin', 'Allantoin', 'Propanediol', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Citric Acid'],
    category: 'toner',
  },

  // ==================== Naturium ====================
  {
    name: 'Naturium Tranexamic Acid Topical Acid 5%',
    brand: 'Naturium',
    ingredients: ['Water', 'Tranexamic Acid', 'Niacinamide', 'Kojic Acid', 'Licorice Root Extract', 'Alpha-Arbutin', 'Glycerin', 'Propanediol', 'Sodium Hyaluronate', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Citric Acid'],
    category: 'serum',
  },
  {
    name: 'Naturium Vitamin C Complex Serum',
    brand: 'Naturium',
    ingredients: ['Water', 'Ascorbyl Glucoside', 'Sodium Ascorbyl Phosphate', 'Ascorbic Acid', 'Glycerin', 'Propanediol', 'Squalane', 'Dimethicone', 'Tocopherol', 'Ferulic Acid', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },

  // ==================== Summer Fridays ====================
  {
    name: 'Summer Fridays Jet Lag Mask',
    brand: 'Summer Fridays',
    ingredients: ['Water', 'Glycerin', 'Caprylic/Capric Triglyceride', 'Niacinamide', 'Sodium Hyaluronate', 'Chestnut Extract', 'Aloe Barbadensis Leaf Juice', 'Glycyrrhiza Glabra Root Extract', 'Vitamin E', 'Ceramide NP', 'Cetearyl Alcohol', 'Dimethicone', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'mask',
  },

  // ==================== Innisfree ====================
  {
    name: 'Innisfree Green Tea Seed Serum',
    brand: 'Innisfree',
    ingredients: ['Water', 'Glycerin', 'Camellia Sinensis Seed Extract', 'Betaine', 'Propanediol', 'Niacinamide', 'Sodium Hyaluronate', 'Panthenol', 'Trehalose', 'Ceramide NP', 'Carbomer', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },

  // ==================== Laneige ====================
  {
    name: 'Laneige Water Sleeping Mask',
    brand: 'Laneige',
    ingredients: ['Water', 'Butylene Glycol', 'Glycerin', 'Cyclopentasiloxane', 'Trehalose', 'Sodium Hyaluronate', 'Hydrolyzed Conchiolin Protein', 'Chenopodium Quinoa Seed Extract', 'Beta-Glucan', 'Panthenol', 'Dimethicone', 'Dimethicone/Vinyl Dimethicone Crosspolymer', 'Carbomer', 'Phenoxyethanol', 'Ethylhexylglycerin', 'Fragrance'],
    category: 'mask',
  },
  {
    name: 'Laneige Lip Sleeping Mask',
    brand: 'Laneige',
    ingredients: ['Diisostearyl Malate', 'Hydrogenated Polyisobutene', 'Phytosteryl/Isostearyl/Cetyl/Stearyl/Behenyl Dimer Dilinoleate', 'Shea Butter', 'Coconut Oil', 'Murumuru Seed Butter', 'Beeswax', 'Vitamin C', 'Panthenol', 'Rubus Idaeus Seed Extract', 'Fragaria Vesca Fruit Extract', 'Vaccinium Macrocarpon Fruit Extract', 'Fragrance'],
    category: 'lip care',
  },

  // ==================== Peach & Lily ====================
  {
    name: 'Peach & Lily Glass Skin Refining Serum',
    brand: 'Peach & Lily',
    ingredients: ['Water', 'Niacinamide', 'Glycerin', 'Sodium Hyaluronate', 'Madecassoside', 'Peach Extract', 'Japanese White Willow Bark Extract', 'Galactomyces Ferment Filtrate', 'Ceramide NP', 'Allantoin', 'Panthenol', 'Propanediol', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },

  // ==================== Beauty of Joseon ====================
  {
    name: 'Beauty of Joseon Relief Sun SPF 50',
    brand: 'Beauty of Joseon',
    ingredients: ['Rice Extract', 'Grain Ferment Filtrate', 'Dibutyl Adipate', 'Propanediol', 'Diethylamino Hydroxybenzoyl Hexyl Benzoate', 'Polymethylsilsesquioxane', 'Ethylhexyl Triazone', 'Niacinamide', 'Methylene Bis-Benzotriazolyl Tetramethylbutylphenol', 'Bis-Ethylhexyloxyphenol Methoxyphenyl Triazine', 'Water', 'Glycerin', 'Camellia Sinensis Leaf Extract', 'Morus Alba Bark Extract', '1,2-Hexanediol', 'Sodium Hyaluronate'],
    category: 'sunscreen',
  },
  {
    name: 'Beauty of Joseon Glow Serum Propolis + Niacinamide',
    brand: 'Beauty of Joseon',
    ingredients: ['Propolis Extract', 'Niacinamide', 'Glycerin', 'Butylene Glycol', 'Water', 'Sodium Hyaluronate', 'Panthenol', '1,2-Hexanediol', 'Xanthan Gum', 'Ethylhexylglycerin'],
    category: 'serum',
  },

  // ==================== Bioderma ====================
  {
    name: 'Bioderma Sensibio H2O Micellar Water',
    brand: 'Bioderma',
    barcode: '3401396741275',
    ingredients: ['Water', 'PEG-6 Caprylic/Capric Glycerides', 'Fructooligosaccharides', 'Mannitol', 'Xylitol', 'Rhamnose', 'Cucumis Sativus Fruit Extract', 'Propylene Glycol', 'Disodium EDTA', 'Cetrimonium Bromide'],
    category: 'cleanser',
  },

  // ==================== Krave Beauty ====================
  {
    name: 'Krave Beauty Great Barrier Relief',
    brand: 'Krave Beauty',
    ingredients: ['Water', 'Squalane', 'Glycerin', 'Pentylene Glycol', 'Niacinamide', 'Sodium Hyaluronate', 'Tamanu Oil', 'Safflower Seed Oil', 'Ceramide NP', 'Allantoin', 'Panthenol', 'Tocopherol', 'Cetearyl Olivate', 'Sorbitan Olivate', 'Sodium Carbomer', 'Phenoxyethanol', 'Ethylhexylglycerin'],
    category: 'serum',
  },

  // ==================== Vichy ====================
  {
    name: 'Vichy Mineral 89 Hyaluronic Acid Serum',
    brand: 'Vichy',
    ingredients: ['Water', 'Glycerin', 'Sodium Hyaluronate', 'Vichy Mineralizing Water', 'Caprylyl Glycol', 'Carbomer', 'Citric Acid', 'Sodium Hydroxide'],
    category: 'serum',
  },
];

// ---- Search / Lookup Helpers ----

/**
 * Normalize a string for fuzzy matching: lowercase, remove punctuation.
 */
function normalize(s) {
  return s.toLowerCase().replace(/['']/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Search curated products by name or brand substring.
 * Returns results sorted by relevance (name match > brand-only match).
 */
function searchCuratedProducts(query) {
  if (!query || query.length < 2) return [];
  const q = normalize(query);
  const tokens = q.split(' ').filter(Boolean);

  const scored = [];
  for (const product of CURATED_PRODUCTS) {
    const nameNorm = normalize(product.name);
    const brandNorm = normalize(product.brand);
    const combined = nameNorm + ' ' + brandNorm;

    // All tokens must appear somewhere in name+brand
    const allMatch = tokens.every(t => combined.includes(t));
    if (!allMatch) continue;

    // Score: exact name match > name contains > brand-only
    let score = 0;
    if (nameNorm === q) score = 100;
    else if (nameNorm.startsWith(q)) score = 90;
    else if (nameNorm.includes(q)) score = 80;
    else if (brandNorm === q) score = 70;
    else if (brandNorm.startsWith(q)) score = 60;
    else score = 50; // all tokens matched across name+brand

    scored.push({ ...product, _score: score });
  }

  scored.sort((a, b) => b._score - a._score);
  return scored.map(({ _score, ...product }) => product);
}

/**
 * Lookup a curated product by barcode (exact match).
 */
function lookupCuratedBarcode(barcode) {
  if (!barcode) return null;
  return CURATED_PRODUCTS.find(p => p.barcode === barcode) || null;
}

/**
 * Enrich ingredients for a product found externally with empty/short ingredient lists.
 * Tries to match against curated DB by normalized name.
 */
function enrichIngredients(productName, existingIngredients) {
  if (!productName) return existingIngredients || [];
  // If we already have a decent ingredient list, keep it
  if (existingIngredients && existingIngredients.length >= 3) return existingIngredients;

  const nameNorm = normalize(productName);
  for (const product of CURATED_PRODUCTS) {
    const curatedNorm = normalize(product.name);
    // Match if names are very similar
    if (curatedNorm === nameNorm || curatedNorm.includes(nameNorm) || nameNorm.includes(curatedNorm)) {
      if (product.ingredients.length > (existingIngredients || []).length) {
        return product.ingredients;
      }
    }
  }

  return existingIngredients || [];
}

module.exports = {
  CURATED_PRODUCTS,
  searchCuratedProducts,
  lookupCuratedBarcode,
  enrichIngredients,
};
