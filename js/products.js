const PRODUCTS = [
  {
    "sku": "SNK-001",
    "name": "Reef Explorer Snorkel Mask",
    "category": "Snorkel & Dive",
    "subcategory": "Masks",
    "price": 42.99,
    "rentalRate": 4.78,
    "availability": "Both",
    "colors": [
      "Black",
      "Clear"
    ],
    "sizes": [
      "L",
      "M",
      "S"
    ],
    "variants": [
      {
        "sku": "SNK-001-S-CLR",
        "size": "S",
        "color": "Clear",
        "gender": "U"
      },
      {
        "sku": "SNK-001-M-CLR",
        "size": "M",
        "color": "Clear",
        "gender": "U"
      },
      {
        "sku": "SNK-001-L-CLR",
        "size": "L",
        "color": "Clear",
        "gender": "U"
      },
      {
        "sku": "SNK-001-S-BLK",
        "size": "S",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SNK-001-M-BLK",
        "size": "M",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SNK-001-L-BLK",
        "size": "L",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "SNK-003",
    "name": "Junior Snorkel Set (Kids)",
    "category": "Snorkel & Dive",
    "subcategory": "Sets",
    "price": 34.99,
    "rentalRate": 4.35,
    "availability": "Both",
    "colors": [
      "Aqua",
      "Pink"
    ],
    "sizes": [
      "Age 4-7",
      "Age 8-12"
    ],
    "variants": [
      {
        "sku": "SNK-003-K4-7-AQUA",
        "size": "Age 4-7",
        "color": "Aqua",
        "gender": "U"
      },
      {
        "sku": "SNK-003-K4-7-PINK",
        "size": "Age 4-7",
        "color": "Pink",
        "gender": "U"
      },
      {
        "sku": "SNK-003-K8-12-AQUA",
        "size": "Age 8-12",
        "color": "Aqua",
        "gender": "U"
      },
      {
        "sku": "SNK-003-K8-12-PINK",
        "size": "Age 8-12",
        "color": "Pink",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "FIN-001",
    "name": "Open-Heel Dive Fins",
    "category": "Snorkel & Dive",
    "subcategory": "Fins",
    "price": 79.0,
    "rentalRate": 6.44,
    "availability": "Both",
    "colors": [
      "Black"
    ],
    "sizes": [
      "L (M9-10)",
      "M (W8-9 / M7-8)",
      "S (W6-7)",
      "XL (M11-12)"
    ],
    "variants": [
      {
        "sku": "FIN-001-S",
        "size": "S (W6-7)",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "FIN-001-M",
        "size": "M (W8-9 / M7-8)",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "FIN-001-L",
        "size": "L (M9-10)",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "FIN-001-XL",
        "size": "XL (M11-12)",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "FIN-003",
    "name": "Kids Swim Fins",
    "category": "Snorkel & Dive",
    "subcategory": "Fins",
    "price": 29.99,
    "rentalRate": 3.15,
    "availability": "Both",
    "colors": [
      "Aqua"
    ],
    "sizes": [
      "Kids M",
      "Kids S"
    ],
    "variants": [
      {
        "sku": "FIN-003-S",
        "size": "Kids S",
        "color": "Aqua",
        "gender": "U"
      },
      {
        "sku": "FIN-003-M",
        "size": "Kids M",
        "color": "Aqua",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "BCH-003",
    "name": "Beach Towel Tropical Print",
    "category": "Beach Essentials",
    "subcategory": "Towels",
    "price": 24.99,
    "rentalRate": 2.71,
    "availability": "Both",
    "colors": [
      "Palm Print",
      "Reef Print",
      "Sunset Print"
    ],
    "sizes": [
      "Standard"
    ],
    "variants": [
      {
        "sku": "BCH-003-SUNSET",
        "size": "Standard",
        "color": "Sunset Print",
        "gender": "U"
      },
      {
        "sku": "BCH-003-REEF",
        "size": "Standard",
        "color": "Reef Print",
        "gender": "U"
      },
      {
        "sku": "BCH-003-PALM",
        "size": "Standard",
        "color": "Palm Print",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "SUR-003",
    "name": "Beginner Foam Surfboard",
    "category": "Surfing",
    "subcategory": "Surfboards",
    "price": 279.0,
    "rentalRate": 15.03,
    "availability": "Both",
    "colors": [
      "Blue"
    ],
    "sizes": [
      "7'0",
      "8'0",
      "9'0"
    ],
    "variants": [
      {
        "sku": "SUR-003-7FT",
        "size": "7'0",
        "color": "Blue",
        "gender": "U"
      },
      {
        "sku": "SUR-003-8FT",
        "size": "8'0",
        "color": "Blue",
        "gender": "U"
      },
      {
        "sku": "SUR-003-9FT",
        "size": "9'0",
        "color": "Blue",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "APP-001",
    "name": "Tide & Tempo Logo Tee",
    "category": "Apparel",
    "subcategory": "Shirts",
    "price": 24.99,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Teal"
    ],
    "sizes": [
      "L",
      "M",
      "S",
      "XL",
      "XS"
    ],
    "variants": [
      {
        "sku": "APP-001-XS-M",
        "size": "XS",
        "color": "Teal",
        "gender": "M"
      },
      {
        "sku": "APP-001-XS-W",
        "size": "XS",
        "color": "Teal",
        "gender": "W"
      },
      {
        "sku": "APP-001-S-M",
        "size": "S",
        "color": "Teal",
        "gender": "M"
      },
      {
        "sku": "APP-001-S-W",
        "size": "S",
        "color": "Teal",
        "gender": "W"
      },
      {
        "sku": "APP-001-M-M",
        "size": "M",
        "color": "Teal",
        "gender": "M"
      },
      {
        "sku": "APP-001-M-W",
        "size": "M",
        "color": "Teal",
        "gender": "W"
      },
      {
        "sku": "APP-001-L-M",
        "size": "L",
        "color": "Teal",
        "gender": "M"
      },
      {
        "sku": "APP-001-L-W",
        "size": "L",
        "color": "Teal",
        "gender": "W"
      },
      {
        "sku": "APP-001-XL-M",
        "size": "XL",
        "color": "Teal",
        "gender": "M"
      },
      {
        "sku": "APP-001-XL-W",
        "size": "XL",
        "color": "Teal",
        "gender": "W"
      }
    ]
  },
  {
    "sku": "SNK-002",
    "name": "Pro Anti-Fog Snorkel Mask",
    "category": "Snorkel & Dive",
    "subcategory": "Masks",
    "price": 58.0,
    "rentalRate": 5.51,
    "availability": "Both",
    "colors": [
      "Black",
      "Clear"
    ],
    "sizes": [
      "L",
      "M",
      "S"
    ],
    "variants": [
      {
        "sku": "SNK-002-S-CLR",
        "size": "S",
        "color": "Clear",
        "gender": "U"
      },
      {
        "sku": "SNK-002-M-CLR",
        "size": "M",
        "color": "Clear",
        "gender": "U"
      },
      {
        "sku": "SNK-002-L-CLR",
        "size": "L",
        "color": "Clear",
        "gender": "U"
      },
      {
        "sku": "SNK-002-S-BLK",
        "size": "S",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SNK-002-M-BLK",
        "size": "M",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SNK-002-L-BLK",
        "size": "L",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "SNK-004",
    "name": "Adult Snorkel Set",
    "category": "Snorkel & Dive",
    "subcategory": "Sets",
    "price": 64.99,
    "rentalRate": 7.01,
    "availability": "Both",
    "colors": [
      "Black"
    ],
    "sizes": [
      "L",
      "M",
      "S"
    ],
    "variants": [
      {
        "sku": "SNK-004-S",
        "size": "S",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SNK-004-M",
        "size": "M",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SNK-004-L",
        "size": "L",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "FIN-002",
    "name": "Travel Snorkel Fins",
    "category": "Snorkel & Dive",
    "subcategory": "Fins",
    "price": 49.99,
    "rentalRate": 5.38,
    "availability": "Both",
    "colors": [
      "Black"
    ],
    "sizes": [
      "L (M9-10)",
      "M (W8-9 / M7-8)",
      "S (W6-7)",
      "XL (M11-12)"
    ],
    "variants": [
      {
        "sku": "FIN-002-S",
        "size": "S (W6-7)",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "FIN-002-M",
        "size": "M (W8-9 / M7-8)",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "FIN-002-L",
        "size": "L (M9-10)",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "FIN-002-XL",
        "size": "XL (M11-12)",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "WET-001",
    "name": "3mm Shorty Wetsuit",
    "category": "Snorkel & Dive",
    "subcategory": "Wetsuits",
    "price": 109.0,
    "rentalRate": 10.31,
    "availability": "Both",
    "colors": [
      "Black"
    ],
    "sizes": [
      "L",
      "M",
      "S",
      "XL"
    ],
    "variants": [
      {
        "sku": "WET-001-S-M",
        "size": "S",
        "color": "Black",
        "gender": "M"
      },
      {
        "sku": "WET-001-S-W",
        "size": "S",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "WET-001-M-M",
        "size": "M",
        "color": "Black",
        "gender": "M"
      },
      {
        "sku": "WET-001-M-W",
        "size": "M",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "WET-001-L-M",
        "size": "L",
        "color": "Black",
        "gender": "M"
      },
      {
        "sku": "WET-001-L-W",
        "size": "L",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "WET-001-XL-M",
        "size": "XL",
        "color": "Black",
        "gender": "M"
      },
      {
        "sku": "WET-001-XL-W",
        "size": "XL",
        "color": "Black",
        "gender": "W"
      }
    ]
  },
  {
    "sku": "WET-002",
    "name": "Rashguard Long Sleeve",
    "category": "Apparel",
    "subcategory": "Rashguards",
    "price": 32.99,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Coral",
      "Navy"
    ],
    "sizes": [
      "L",
      "M",
      "S",
      "XL"
    ],
    "variants": [
      {
        "sku": "WET-002-S-M",
        "size": "S",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "WET-002-S-W",
        "size": "S",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "WET-002-M-M",
        "size": "M",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "WET-002-M-W",
        "size": "M",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "WET-002-L-M",
        "size": "L",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "WET-002-L-W",
        "size": "L",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "WET-002-XL-M",
        "size": "XL",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "WET-002-XL-W",
        "size": "XL",
        "color": "Coral",
        "gender": "W"
      }
    ]
  },
  {
    "sku": "APP-002",
    "name": "Apo Island Souvenir Tee",
    "category": "Apparel",
    "subcategory": "Shirts",
    "price": 26.99,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Sand"
    ],
    "sizes": [
      "L",
      "M",
      "S",
      "XL",
      "XS"
    ],
    "variants": [
      {
        "sku": "APP-002-XS-M",
        "size": "XS",
        "color": "Sand",
        "gender": "M"
      },
      {
        "sku": "APP-002-XS-W",
        "size": "XS",
        "color": "Sand",
        "gender": "W"
      },
      {
        "sku": "APP-002-S-M",
        "size": "S",
        "color": "Sand",
        "gender": "M"
      },
      {
        "sku": "APP-002-S-W",
        "size": "S",
        "color": "Sand",
        "gender": "W"
      },
      {
        "sku": "APP-002-M-M",
        "size": "M",
        "color": "Sand",
        "gender": "M"
      },
      {
        "sku": "APP-002-M-W",
        "size": "M",
        "color": "Sand",
        "gender": "W"
      },
      {
        "sku": "APP-002-L-M",
        "size": "L",
        "color": "Sand",
        "gender": "M"
      },
      {
        "sku": "APP-002-L-W",
        "size": "L",
        "color": "Sand",
        "gender": "W"
      },
      {
        "sku": "APP-002-XL-M",
        "size": "XL",
        "color": "Sand",
        "gender": "M"
      },
      {
        "sku": "APP-002-XL-W",
        "size": "XL",
        "color": "Sand",
        "gender": "W"
      }
    ]
  },
  {
    "sku": "BCH-004",
    "name": "Microfiber Quick-Dry Towel",
    "category": "Beach Essentials",
    "subcategory": "Towels",
    "price": 28.0,
    "rentalRate": 3.29,
    "availability": "Both",
    "colors": [
      "Black",
      "Blue",
      "Coral"
    ],
    "sizes": [
      "L (80x160cm)",
      "M (60x120cm)"
    ],
    "variants": [
      {
        "sku": "BCH-004-M-BLU",
        "size": "M (60x120cm)",
        "color": "Blue",
        "gender": "U"
      },
      {
        "sku": "BCH-004-L-BLU",
        "size": "L (80x160cm)",
        "color": "Blue",
        "gender": "U"
      },
      {
        "sku": "BCH-004-M-CRL",
        "size": "M (60x120cm)",
        "color": "Coral",
        "gender": "U"
      },
      {
        "sku": "BCH-004-L-CRL",
        "size": "L (80x160cm)",
        "color": "Coral",
        "gender": "U"
      },
      {
        "sku": "BCH-004-M-BLK",
        "size": "M (60x120cm)",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "BCH-004-L-BLK",
        "size": "L (80x160cm)",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "BCH-012",
    "name": "Cooler Bag Insulated 24L",
    "category": "Beach Essentials",
    "subcategory": "Coolers",
    "price": 58.0,
    "rentalRate": 4.85,
    "availability": "Both",
    "colors": [
      "Blue"
    ],
    "sizes": [
      "16 L",
      "24 L",
      "40 L"
    ],
    "variants": [
      {
        "sku": "BCH-012-16L",
        "size": "16 L",
        "color": "Blue",
        "gender": "U"
      },
      {
        "sku": "BCH-012-24L",
        "size": "24 L",
        "color": "Blue",
        "gender": "U"
      },
      {
        "sku": "BCH-012-40L",
        "size": "40 L",
        "color": "Blue",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "APP-003",
    "name": "Boardshorts \u2014 Mens",
    "category": "Apparel",
    "subcategory": "Bottoms",
    "price": 44.99,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Navy"
    ],
    "sizes": [
      "28",
      "30",
      "32",
      "34",
      "36",
      "38",
      "40"
    ],
    "variants": [
      {
        "sku": "APP-003-28",
        "size": "28",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "APP-003-30",
        "size": "30",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "APP-003-32",
        "size": "32",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "APP-003-34",
        "size": "34",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "APP-003-36",
        "size": "36",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "APP-003-38",
        "size": "38",
        "color": "Navy",
        "gender": "M"
      },
      {
        "sku": "APP-003-40",
        "size": "40",
        "color": "Navy",
        "gender": "M"
      }
    ]
  },
  {
    "sku": "APP-004",
    "name": "Bikini Set \u2014 Womens",
    "category": "Apparel",
    "subcategory": "Swimwear",
    "price": 54.0,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Aqua",
      "Black",
      "Coral",
      "Tropical Print"
    ],
    "sizes": [
      "L",
      "M",
      "S",
      "XL",
      "XS"
    ],
    "variants": [
      {
        "sku": "APP-004-XS-COR",
        "size": "XS",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-004-XS-AQU",
        "size": "XS",
        "color": "Aqua",
        "gender": "W"
      },
      {
        "sku": "APP-004-XS-BLA",
        "size": "XS",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-004-XS-TRO",
        "size": "XS",
        "color": "Tropical Print",
        "gender": "W"
      },
      {
        "sku": "APP-004-S-COR",
        "size": "S",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-004-S-AQU",
        "size": "S",
        "color": "Aqua",
        "gender": "W"
      },
      {
        "sku": "APP-004-S-BLA",
        "size": "S",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-004-S-TRO",
        "size": "S",
        "color": "Tropical Print",
        "gender": "W"
      },
      {
        "sku": "APP-004-M-COR",
        "size": "M",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-004-M-AQU",
        "size": "M",
        "color": "Aqua",
        "gender": "W"
      },
      {
        "sku": "APP-004-M-BLA",
        "size": "M",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-004-M-TRO",
        "size": "M",
        "color": "Tropical Print",
        "gender": "W"
      },
      {
        "sku": "APP-004-L-COR",
        "size": "L",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-004-L-AQU",
        "size": "L",
        "color": "Aqua",
        "gender": "W"
      },
      {
        "sku": "APP-004-L-BLA",
        "size": "L",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-004-L-TRO",
        "size": "L",
        "color": "Tropical Print",
        "gender": "W"
      },
      {
        "sku": "APP-004-XL-COR",
        "size": "XL",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-004-XL-AQU",
        "size": "XL",
        "color": "Aqua",
        "gender": "W"
      },
      {
        "sku": "APP-004-XL-BLA",
        "size": "XL",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-004-XL-TRO",
        "size": "XL",
        "color": "Tropical Print",
        "gender": "W"
      }
    ]
  },
  {
    "sku": "APP-005",
    "name": "One-Piece Swimsuit",
    "category": "Apparel",
    "subcategory": "Swimwear",
    "price": 58.0,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Black",
      "Coral",
      "Navy"
    ],
    "sizes": [
      "L",
      "M",
      "S",
      "XL"
    ],
    "variants": [
      {
        "sku": "APP-005-S-BLA",
        "size": "S",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-005-S-NAV",
        "size": "S",
        "color": "Navy",
        "gender": "W"
      },
      {
        "sku": "APP-005-S-COR",
        "size": "S",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-005-M-BLA",
        "size": "M",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-005-M-NAV",
        "size": "M",
        "color": "Navy",
        "gender": "W"
      },
      {
        "sku": "APP-005-M-COR",
        "size": "M",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-005-L-BLA",
        "size": "L",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-005-L-NAV",
        "size": "L",
        "color": "Navy",
        "gender": "W"
      },
      {
        "sku": "APP-005-L-COR",
        "size": "L",
        "color": "Coral",
        "gender": "W"
      },
      {
        "sku": "APP-005-XL-BLA",
        "size": "XL",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "APP-005-XL-NAV",
        "size": "XL",
        "color": "Navy",
        "gender": "W"
      },
      {
        "sku": "APP-005-XL-COR",
        "size": "XL",
        "color": "Coral",
        "gender": "W"
      }
    ]
  },
  {
    "sku": "APP-007",
    "name": "Flip Flops Tropical",
    "category": "Apparel",
    "subcategory": "Footwear",
    "price": 14.99,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Tropical"
    ],
    "sizes": [
      "K2-4",
      "M11-12",
      "M9-10",
      "W6-7",
      "W8-9"
    ],
    "variants": [
      {
        "sku": "APP-007-W6-7",
        "size": "W6-7",
        "color": "Tropical",
        "gender": "W"
      },
      {
        "sku": "APP-007-W8-9",
        "size": "W8-9",
        "color": "Tropical",
        "gender": "W"
      },
      {
        "sku": "APP-007-M9-10",
        "size": "M9-10",
        "color": "Tropical",
        "gender": "M"
      },
      {
        "sku": "APP-007-M11-12",
        "size": "M11-12",
        "color": "Tropical",
        "gender": "M"
      },
      {
        "sku": "APP-007-K2-4",
        "size": "K2-4",
        "color": "Tropical",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "SUR-004",
    "name": "Surf Leash 8ft",
    "category": "Surfing",
    "subcategory": "Accessories",
    "price": 22.5,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Black"
    ],
    "sizes": [
      "6 ft",
      "7 ft",
      "8 ft",
      "9 ft"
    ],
    "variants": [
      {
        "sku": "SUR-004-6FT",
        "size": "6 ft",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SUR-004-7FT",
        "size": "7 ft",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SUR-004-8FT",
        "size": "8 ft",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "SUR-004-9FT",
        "size": "9 ft",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "SUR-006",
    "name": "Skim Board Pro",
    "category": "Surfing",
    "subcategory": "Skimboards",
    "price": 89.0,
    "rentalRate": 11.62,
    "availability": "Both",
    "colors": [
      "Tropical"
    ],
    "sizes": [
      "Adult",
      "Youth"
    ],
    "variants": [
      {
        "sku": "SUR-006-YTH",
        "size": "Youth",
        "color": "Tropical",
        "gender": "U"
      },
      {
        "sku": "SUR-006-ADL",
        "size": "Adult",
        "color": "Tropical",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "KIT-002",
    "name": "Kitesurf Harness",
    "category": "Surfing",
    "subcategory": "Kitesurf",
    "price": 139.0,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Black"
    ],
    "sizes": [
      "L",
      "M",
      "S",
      "XL"
    ],
    "variants": [
      {
        "sku": "KIT-002-S",
        "size": "S",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "KIT-002-M",
        "size": "M",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "KIT-002-L",
        "size": "L",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "KIT-002-XL",
        "size": "XL",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "APP-006",
    "name": "UV Hat Wide Brim",
    "category": "Apparel",
    "subcategory": "Hats",
    "price": 28.0,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Black",
      "Natural"
    ],
    "sizes": [
      "L/XL",
      "S/M"
    ],
    "variants": [
      {
        "sku": "APP-006-SM-NAT",
        "size": "S/M",
        "color": "Natural",
        "gender": "U"
      },
      {
        "sku": "APP-006-SM-BLK",
        "size": "S/M",
        "color": "Black",
        "gender": "U"
      },
      {
        "sku": "APP-006-LXL-NAT",
        "size": "L/XL",
        "color": "Natural",
        "gender": "U"
      },
      {
        "sku": "APP-006-LXL-BLK",
        "size": "L/XL",
        "color": "Black",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "KIT-001",
    "name": "Beginner Kitesurf Kit",
    "category": "Surfing",
    "subcategory": "Kitesurf",
    "price": 1099.0,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Blue",
      "Red",
      "Yellow"
    ],
    "sizes": [
      "12 m2",
      "7 m2",
      "9 m2"
    ],
    "variants": [
      {
        "sku": "KIT-001-7M",
        "size": "7 m2",
        "color": "Red",
        "gender": "U"
      },
      {
        "sku": "KIT-001-9M",
        "size": "9 m2",
        "color": "Blue",
        "gender": "U"
      },
      {
        "sku": "KIT-001-12M",
        "size": "12 m2",
        "color": "Yellow",
        "gender": "U"
      }
    ]
  },
  {
    "sku": "BCH-009",
    "name": "Polarized Sunglasses",
    "category": "Beach Essentials",
    "subcategory": "Eyewear",
    "price": 39.99,
    "rentalRate": null,
    "availability": "Sale only",
    "colors": [
      "Aviator/Black",
      "Aviator/Gold",
      "Cat-Eye/Tortoise",
      "Sport/Black",
      "Wayfarer/Black",
      "Wayfarer/Tortoise"
    ],
    "sizes": [
      "One Size"
    ],
    "variants": [
      {
        "sku": "BCH-009-AVI-BLK",
        "size": "One Size",
        "color": "Aviator/Black",
        "gender": "M"
      },
      {
        "sku": "BCH-009-AVI-GLD",
        "size": "One Size",
        "color": "Aviator/Gold",
        "gender": "U"
      },
      {
        "sku": "BCH-009-WAY-BLK",
        "size": "One Size",
        "color": "Wayfarer/Black",
        "gender": "U"
      },
      {
        "sku": "BCH-009-WAY-TOR",
        "size": "One Size",
        "color": "Wayfarer/Tortoise",
        "gender": "U"
      },
      {
        "sku": "BCH-009-SPT-BLK",
        "size": "One Size",
        "color": "Sport/Black",
        "gender": "M"
      },
      {
        "sku": "BCH-009-CAT-TOR",
        "size": "One Size",
        "color": "Cat-Eye/Tortoise",
        "gender": "W"
      }
    ]
  },
  {
    "sku": "BCH-011",
    "name": "Reef Walker Water Shoes",
    "category": "Beach Essentials",
    "subcategory": "Footwear",
    "price": 38.0,
    "rentalRate": 3.07,
    "availability": "Both",
    "colors": [
      "Aqua",
      "Black"
    ],
    "sizes": [
      "Kids 2-4",
      "M11-12",
      "M9-10",
      "W6-7",
      "W8-9"
    ],
    "variants": [
      {
        "sku": "BCH-011-W6-7",
        "size": "W6-7",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "BCH-011-W8-9",
        "size": "W8-9",
        "color": "Black",
        "gender": "W"
      },
      {
        "sku": "BCH-011-M9-10",
        "size": "M9-10",
        "color": "Black",
        "gender": "M"
      },
      {
        "sku": "BCH-011-M11-12",
        "size": "M11-12",
        "color": "Black",
        "gender": "M"
      },
      {
        "sku": "BCH-011-K2-4",
        "size": "Kids 2-4",
        "color": "Aqua",
        "gender": "U"
      }
    ]
  }
];

const SUBCATEGORY_KEYWORDS = {
  "Masks": "snorkel+mask+underwater",
  "Sets": "snorkel+set+beach",
  "Fins": "diving+fins+underwater",
  "Wetsuits": "wetsuit+surfer",
  "Surfboards": "surfboard+wave",
  "Accessories": "surf+leash+beach",
  "Skimboards": "skimboard+beach",
  "Kitesurf": "kitesurfing+ocean",
  "Towels": "beach+towel+sand",
  "Coolers": "cooler+bag+beach",
  "Eyewear": "polarized+sunglasses+beach",
  "Footwear": "water+shoes+beach",
  "Shirts": "tropical+tshirt",
  "Rashguards": "rashguard+surfer",
  "Bottoms": "boardshorts+beach",
  "Swimwear": "swimwear+beach+ocean",
  "Hats": "sun+hat+beach"
};

const COLOR_HEX = {
  "Black": "2d2d2d",
  "White": "f5f5f5",
  "Blue": "1a6fa8",
  "Navy": "1b3a6b",
  "Teal": "00b5a5",
  "Aqua": "00c8c8",
  "Clear": "c8eef5",
  "Pink": "f06292",
  "Red": "e53935",
  "Orange": "ef6c00",
  "Yellow": "fbc02d",
  "Green": "43a047",
  "Grey": "9e9e9e",
  "Gray": "9e9e9e",
  "Brown": "795548",
  "Purple": "8e24aa",
  "Coral": "e8622a",
  "Lime": "8bc34a",
  "Tropical": "00897b",
  "Sand": "c2a97a",
  "Sunset": "ff7043",
  "Midnight": "1a237e",
  "Stripe": "5c6bc0"
};
