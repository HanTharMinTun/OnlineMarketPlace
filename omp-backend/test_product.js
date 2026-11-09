import express from "express";

const router = express.Router();

// Mock database array for products
const products = [
    { id: 1, name: "Mechanical Keyboard", price: 89.99 },
    { id: 2, name: "Wireless Mouse", price: 49.99 }
];

// GET route to fetch all products
router.get("/products", (req, res) => {
    console.log("\n Server Log : Fetching all products");
    res.json(products);
});

// POST route to add a new product
router.post("/products", (req, res) => {
    const { name, price } = req.body;

    if (!name || !price) {
        return res.status(400).json({ error: "Product name and price are required" });
    }

    const newProduct = {
        id: products.length + 1,
        name,
        price: parseFloat(price)
    };

    products.push(newProduct);
    console.log(`\n Server Log : Added product: ${name}`);
    res.status(201).json(newProduct);
});

// Export the router so the main file can use it
export default router;
