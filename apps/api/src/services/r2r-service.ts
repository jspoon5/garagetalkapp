import { desc, eq } from "drizzle-orm";
import type { Database } from "@garagetalk/db";
import { r2rArticles } from "@garagetalk/db";
import { uuidv7 } from "uuidv7";
import { z } from "zod";

export const articleInputSchema = z.object({
  slug: z.string().min(3).max(160).regex(/^[a-z0-9-]+$/),
  title: z.string().min(1).max(220),
  category: z.string().min(1).max(120),
  summary: z.string().max(1000).nullable().optional(),
  bodyMd: z.string().min(1).max(50_000),
  tags: z.array(z.string().min(1).max(80)).max(30).optional(),
  published: z.boolean().optional(),
});

export const articleSearchSchema = z.object({
  q: z.string().max(200).optional(),
  category: z.string().max(120).optional(),
});

export class R2RService {
  constructor(private readonly db: Database) {}

  async createArticle(authorId: string, input: z.infer<typeof articleInputSchema>) {
    const body = articleInputSchema.parse(input);
    const [article] = await this.db
      .insert(r2rArticles)
      .values({
        id: uuidv7(),
        authorId,
        slug: body.slug,
        title: body.title,
        category: body.category,
        summary: body.summary ?? null,
        bodyMd: body.bodyMd,
        tags: body.tags ?? [],
        published: body.published ?? false,
      })
      .returning();
    return article ?? null;
  }

  async updateArticle(slug: string, input: Partial<z.infer<typeof articleInputSchema>>) {
    const body = articleInputSchema.partial().parse(input);
    const [article] = await this.db
      .update(r2rArticles)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(r2rArticles.slug, slug))
      .returning();
    return article ?? null;
  }

  async deleteArticle(slug: string) {
    const [article] = await this.db
      .delete(r2rArticles)
      .where(eq(r2rArticles.slug, slug))
      .returning();
    return article ?? null;
  }

  async search(input: z.infer<typeof articleSearchSchema>) {
    const body = articleSearchSchema.parse(input);
    const rows = await this.db
      .select()
      .from(r2rArticles)
      .orderBy(desc(r2rArticles.updatedAt))
      .limit(100);
    const q = body.q?.trim().toLowerCase();
    const category = body.category?.trim().toLowerCase();
    return rows.filter((row) => {
      if (!row.published) return false;
      if (category && row.category.toLowerCase() !== category) return false;
      if (!q) return true;
      const haystack = [row.slug, row.title, row.summary, row.bodyMd, row.category, ...row.tags]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }

  async loadCorpusBySlug(slug: string) {
    const [article] = await this.db
      .select()
      .from(r2rArticles)
      .where(eq(r2rArticles.slug, slug))
      .limit(1);
    if (!article?.published) return null;
    return {
      slug: article.slug,
      title: article.title,
      category: article.category,
      tags: article.tags,
      bodyMd: article.bodyMd,
    };
  }
}
