# FreshFind - Karachi's Local Market Guide

---

## ⚠️ **CRITICAL: DO NOT OPEN HTML FILES DIRECTLY**

### **YOU MUST RUN THIS WEBSITE THROUGH A LOCAL SERVER**

**❌ WRONG:** Opening files by copying file path or double-clicking HTML files  
**✅ CORRECT:** Running through VS Code Live Server or any HTTP server

**Why?** This website uses JavaScript `fetch()` to load JSON data. Modern browsers **BLOCK** fetch requests when you open files directly via `file://` protocol due to security restrictions. The website will appear broken with no data showing.

A complete web application for discovering local markets and fresh produce across Karachi.

## 📁 Project Structure

```
merged_freshfind/
├── market.html             # Markets listing page (main entry point)
├── marketdetails.html      # Individual market details
├── produces.html           # Produces catalogue page
├── producesdetails.html    # Individual produce details
├── bookmarks.html          # Saved items page
│
├── css/                    # Stylesheets
│   ├── market.css         # Base styles
│   ├── navbar.css         # Navigation bar
│   ├── produces.css       # Produces page styles
│   ├── producesdetails.css # Produce detail styles
│   ├── marketdetails.css  # Market detail styles
│   ├── bookmarks.css      # Bookmarks page styles
│   ├── chatbot.css        # Chatbot widget styles
│   └── footer.css         # Footer styles
│
├── js/                     # JavaScript files
│   ├── navbar.js          # Navigation functionality
│   ├── market.js          # Markets page logic
│   ├── market-highlights.js # "Open now" carousel
│   ├── marketdetails.js   # Market details logic
│   ├── produces.js        # Produces page logic
│   ├── producesdetails.js # Produce details logic
│   ├── bookmarks.js       # Bookmark functionality
│   ├── reviews.js         # Reviews system
│   ├── chatbot.js         # FreshBot chatbot
│   ├── visitor.js         # Visitor tracking
│   └── footer.js          # Footer functionality
│
├── data/                   # JSON data files
│   ├── market.json        # Market data
│   ├── marketdetails.json # Market details data
│   ├── produces.json      # Produce items data
│   ├── reviews.json       # Customer reviews
│   └── chatbot.json       # Chatbot responses
│
└── images/                 # Image assets
    ├── navbar/            # Logo and nav images
    ├── market/            # Market photos
    ├── produces/          # Produce photos
    └── bookmark/          # Bookmark page images
```

## 🚀 Getting Started

1. Open `market.html` in a web browser to start (main entry point)
2. Navigate through the site using the navigation bar
3. All pages work without a backend server

## 📄 Main Pages

### 1. Markets Directory (`market.html`)
- Browse all 12 markets in Karachi
- Filter by area, day, and produce type
- Search functionality
- "Open right now" highlights carousel
- Sort options (A-Z, Z-A, Open first, Nearest)

### 2. Market Details (`marketdetails.html`)
- Individual market information
- Opening hours and schedule
- Location map placeholder
- Main produces sold at the market
- Customer reviews with ratings
- Pagination for reviews and produces

### 3. Produces Catalogue (`produces.html`)
- Browse 48 produce items
- Filter by category
- Search by name
- "What's in season" feature
- Pagination (6 items per page)
- Market price display

### 4. Produce Details (`producesdetails.html`)
- Individual produce information
- Current market price
- Available markets list
- Season information
- Customer reviews (aggregated from all markets)
- Suggested produces

### 5. Bookmarks (`bookmarks.html`)
- Save markets and produces
- View all saved items
- Remove bookmarks
- Export/Share functionality
- Quick statistics

## 🔗 Navigation Flow

```
market.html (Main Entry Point)
    ↓
    ├─→ marketdetails.html?id=[market-id]
    ├─→ produces.html → producesdetails.html?id=[produce-id]
    └─→ bookmarks.html (Saved items)
```

## 🎨 Features

### Common Features (All Pages)
- ✅ Sticky navigation bar with scroll effects
- ✅ Mobile-responsive hamburger menu
- ✅ Bookmark button in navbar (with count badge)
- ✅ FreshBot chatbot widget (bottom-right corner)
- ✅ Animated ticker at top of page
- ✅ Bookmark toast notifications

### Markets Features
- Live open/closed status based on real-time
- Filter by area, day, and produce type
- Distance calculation from user location
- Bookmark individual markets
- Reviews and ratings system
- Produce availability per market

### Produces Features
- Category-based filtering
- Search by produce name
- Seasonal produce highlighting
- Price display per produce
- Market availability list
- Cross-referencing with markets

### Bookmarks Features
- Save both markets and produces
- Quick statistics summary
- Export and share bookmarks
- Clear all functionality
- Personal notes (optional)

## 📊 Data Files

### `data/market.json`
Contains all market information:
- Name, area, address
- Opening hours (per day)
- Produce types sold
- Images and descriptions

### `data/produces.json`
Contains all produce information:
- Name, category, description
- Season months
- Price (amount + unit)
- Available markets (by ID)
- Images

### `data/marketdetails.json`
Extended market information:
- Coordinates for maps
- Detailed produce list
- Additional metadata

### `data/reviews.json`
Customer reviews:
- Market-specific reviews
- Ratings (1-5 stars)
- Reviewer information
- Date and helpful count

### `data/chatbot.json`
FreshBot responses:
- FAQs and answers
- Quick reply suggestions
- Context-aware responses

## 🎯 Technology Stack

- **HTML5** - Semantic markup
- **CSS3** - Modern styling with custom properties
- **JavaScript (Vanilla)** - No frameworks required
- **JSON** - Data storage

## 🔍 Testing Instructions

1. **Markets Test**
   - Click "Markets" in navigation
   - Try search functionality
   - Test filters (area, day, produce)
   - Click a market card to open details
   - Test bookmark functionality

2. **Produces Test**
   - Click "Produces" in navigation
   - Try category filter
   - Test search functionality
   - Click a produce card to view details
   - Check pagination works

3. **Bookmarks Test**
   - Bookmark a market and a produce
   - Click bookmark icon in navbar
   - Verify saved items appear
   - Test remove bookmark functionality

4. **Chatbot Test**
   - Click FreshBot icon (bottom-right)
   - Send a test message
   - Try suggested questions

## ⚠️ Important Notes

- **Market pages** (market.html, marketdetails.html) are from the **ak_pages** version
- **Produces pages** (produces.html, producesdetails.html) are from the **produces_cline** version
- All cross-references between markets and produces are maintained
- Images must be present in the `images/` folder for proper display
- JavaScript files load data from `data/` folder - ensure JSON files are present

## 📱 Browser Compatibility

- Chrome/Edge (recommended)
- Firefox
- Safari
- Mobile browsers (responsive design)

## 🆘 Troubleshooting

**Images not loading?**
- Check that `images/` folder has all subfolders
- Verify image paths in HTML match actual files

**Data not showing?**
- Open browser console (F12)
- Check for errors loading JSON files
- Verify `data/` folder contains all JSON files

**Navigation not working?**
- Ensure all HTML files are in the root folder
- Check file names match exactly (case-sensitive)

## 📝 License

This project is part of FreshFind - Karachi's Local Market Guide.

---

**Ready to explore Karachi's freshest markets!** 🌿
