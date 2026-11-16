DO $$
DECLARE collision record;
BEGIN
 SELECT claims.author_id, claims.slug INTO collision
 FROM (
  SELECT p.author_id, COALESCE(p.published->>'slug',(SELECT r.snapshot->>'slug' FROM revisions r WHERE r.post_id=p.id ORDER BY r.id DESC LIMIT 1)) AS slug
  FROM posts p
 ) claims
 WHERE claims.slug IS NOT NULL
 GROUP BY claims.author_id,claims.slug
 HAVING count(*)>1
 LIMIT 1;
 IF FOUND THEN
  RAISE EXCEPTION 'Cannot reserve historical post slugs: author % has duplicate slug %',collision.author_id,collision.slug
   USING HINT='Keep the currently published post at this URL. Export the other post, then explicitly delete the duplicate through the API before retrying migrations. No published URL has been changed.';
 END IF;
END $$;

ALTER TABLE posts ADD COLUMN first_published_slug text;
UPDATE posts p SET first_published_slug=COALESCE(p.published->>'slug',(SELECT r.snapshot->>'slug' FROM revisions r WHERE r.post_id=p.id ORDER BY r.id DESC LIMIT 1));
CREATE UNIQUE INDEX posts_reserved_slug ON posts(author_id,first_published_slug) WHERE first_published_slug IS NOT NULL;
