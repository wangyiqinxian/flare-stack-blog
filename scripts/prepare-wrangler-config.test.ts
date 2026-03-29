import { describe, expect, it } from "vitest";
import {
  inferZoneName,
  normalizeHostname,
  prepareWranglerConfigContent,
  resolveDeployDomainMode,
} from "./prepare-wrangler-config";

const template = `{
  "routes": [
    {
      "pattern": "DOMAIN_PLACEHOLDER",
      "custom_domain": true
    }
  ],
  "d1_databases": [{ "database_id": "D1_DATABASE_ID" }],
  "kv_namespaces": [{ "id": "KV_NAMESPACE_ID" }],
  "r2_buckets": [{ "bucket_name": "bucket-name-placeholder" }]
}`;

describe("prepare-wrangler-config", () => {
  it("normalizes hostnames from urls and removes trailing slashes", () => {
    expect(normalizeHostname("https://blog.example.com/")).toBe(
      "blog.example.com",
    );
    expect(normalizeHostname("blog.example.com/")).toBe("blog.example.com");
  });

  it("strips port numbers from bare hostnames", () => {
    expect(normalizeHostname("blog.example.com:8080")).toBe(
      "blog.example.com",
    );
    expect(normalizeHostname("blog.example.com:8080/")).toBe(
      "blog.example.com",
    );
  });

  it("infers zone names from multi-level public suffixes", () => {
    expect(inferZoneName("blog.example.com")).toBe("example.com");
    expect(inferZoneName("foo.bar.example.co.uk")).toBe("example.co.uk");
  });

  it("defaults to custom_domain mode", () => {
    expect(resolveDeployDomainMode({})).toBe("custom_domain");
  });

  it("supports ROUTE=1 as a shorthand for routes mode", () => {
    expect(resolveDeployDomainMode({ ROUTE: "1" })).toBe("routes");
    expect(resolveDeployDomainMode({ ROUTE: "true" })).toBe("routes");
  });

  it("renders custom_domain routes into the wrangler template", () => {
    const content = prepareWranglerConfigContent({
      bucketName: "blog-bucket",
      d1DatabaseId: "d1-id",
      domain: "blog.example.com",
      kvNamespaceId: "kv-id",
      mode: "custom_domain",
      template,
    });

    expect(content).toContain('"pattern": "blog.example.com"');
    expect(content).toContain('"custom_domain": true');
    expect(content).not.toContain('"zone_name": "example.com"');
    expect(content).toContain('"database_id": "d1-id"');
    expect(content).toContain('"id": "kv-id"');
    expect(content).toContain('"bucket_name": "blog-bucket"');
  });

  it("renders routes mode from DOMAIN and inferred zone name", () => {
    const content = prepareWranglerConfigContent({
      bucketName: "blog-bucket",
      d1DatabaseId: "d1-id",
      domain: "foo.bar.example.co.uk",
      kvNamespaceId: "kv-id",
      mode: "routes",
      template,
    });

    expect(content).toContain('"pattern": "foo.bar.example.co.uk/*"');
    expect(content).toContain('"zone_name": "example.co.uk"');
    expect(content).not.toContain('"custom_domain": true');
  });

  it("prefers ZONE_NAME when provided", () => {
    const content = prepareWranglerConfigContent({
      bucketName: "blog-bucket",
      d1DatabaseId: "d1-id",
      domain: "xx.yy.zz",
      kvNamespaceId: "kv-id",
      mode: "routes",
      template,
      zoneNameOverride: "xx.yy.zz",
    });

    expect(content).toContain('"pattern": "xx.yy.zz/*"');
    expect(content).toContain('"zone_name": "xx.yy.zz"');
  });
});
