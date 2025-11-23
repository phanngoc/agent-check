import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // Create test user
  const hashedPassword = await bcrypt.hash('password123', 10);
  const user = await prisma.user.upsert({
    where: { email: 'test@example.com' },
    update: {},
    create: {
      email: 'test@example.com',
      password: hashedPassword,
      name: 'Test User',
    },
  });

  console.log('Created user:', user.email);

  // Create products
  const products = [
    {
      name: 'Laptop Dell XPS 13',
      description: 'High-performance laptop with Intel i7 processor, 16GB RAM, 512GB SSD',
      price: 24990000,
      image: 'https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=500',
      stock: 10,
      category: 'Electronics',
    },
    {
      name: 'iPhone 15 Pro',
      description: 'Latest iPhone with A17 Pro chip, 256GB storage, Pro camera system',
      price: 29990000,
      image: 'https://images.unsplash.com/photo-1592750475338-74b7b21085ab?w=500',
      stock: 15,
      category: 'Electronics',
    },
    {
      name: 'Samsung 4K TV 55 inch',
      description: 'Smart TV with 4K UHD display, HDR10+, built-in streaming apps',
      price: 15990000,
      image: 'https://images.unsplash.com/photo-1593359677879-a4bb92f829d1?w=500',
      stock: 8,
      category: 'Electronics',
    },
    {
      name: 'AirPods Pro 2',
      description: 'Wireless earbuds with active noise cancellation, spatial audio',
      price: 5990000,
      image: 'https://images.unsplash.com/photo-1606220945770-b5b6c2c55bf1?w=500',
      stock: 20,
      category: 'Electronics',
    },
    {
      name: 'MacBook Pro 16"',
      description: 'Professional laptop with M3 Max chip, 32GB RAM, 1TB SSD',
      price: 69990000,
      image: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8?w=500',
      stock: 5,
      category: 'Electronics',
    },
    {
      name: 'Sony WH-1000XM5',
      description: 'Premium noise-cancelling headphones with 30-hour battery',
      price: 8990000,
      image: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e?w=500',
      stock: 12,
      category: 'Electronics',
    },
    {
      name: 'Nike Air Max 270',
      description: 'Comfortable running shoes with Air Max cushioning',
      price: 3490000,
      image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
      stock: 25,
      category: 'Fashion',
    },
    {
      name: 'Adidas Ultraboost 22',
      description: 'Premium running shoes with Boost midsole technology',
      price: 3990000,
      image: 'https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=500',
      stock: 18,
      category: 'Fashion',
    },
    {
      name: 'Canon EOS R6',
      description: 'Full-frame mirrorless camera with 20MP sensor, 4K video',
      price: 49990000,
      image: 'https://images.unsplash.com/photo-1606983340126-99ab4feaa64a?w=500',
      stock: 6,
      category: 'Electronics',
    },
    {
      name: 'Dyson V15 Detect',
      description: 'Cordless vacuum cleaner with laser detection technology',
      price: 19990000,
      image: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500',
      stock: 9,
      category: 'Home',
    },
  ];

  for (const product of products) {
    const existing = await prisma.product.findFirst({
      where: { name: product.name },
    });
    if (!existing) {
      await prisma.product.create({
        data: product,
      });
    }
  }

  console.log(`Created ${products.length} products`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

