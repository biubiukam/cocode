import { describe, expect, it } from "vitest"
import {
  baseName,
  hasSeparator,
  isAbsolutePath,
  isUnder,
  isValidName,
  joinPath,
  parentOf,
  relativeTo,
  toPosix,
} from "../src/paths.ts"

describe("toPosix", () => {
  it("normalizes Windows separators", () => {
    expect(toPosix("C:\\work\\repo\\file.ts")).toBe("C:/work/repo/file.ts")
  })

  it("leaves posix paths untouched", () => {
    expect(toPosix("/work/repo/file.ts")).toBe("/work/repo/file.ts")
  })
})

describe("isAbsolutePath", () => {
  it("accepts posix, drive and UNC spellings", () => {
    expect(isAbsolutePath("/work/repo")).toBe(true)
    expect(isAbsolutePath("C:/work/repo")).toBe(true)
    expect(isAbsolutePath("C:\\work\\repo")).toBe(true)
    expect(isAbsolutePath("\\\\server\\share")).toBe(true)
  })

  it("rejects relative spellings", () => {
    expect(isAbsolutePath("src/file.ts")).toBe(false)
    expect(isAbsolutePath("./file.ts")).toBe(false)
    expect(isAbsolutePath("")).toBe(false)
  })
})

describe("joinPath", () => {
  it("joins with a single separator", () => {
    expect(joinPath("/work/repo", "file.ts")).toBe("/work/repo/file.ts")
    expect(joinPath("/work/repo/", "file.ts")).toBe("/work/repo/file.ts")
  })

  it("normalizes a Windows root", () => {
    expect(joinPath("C:\\work\\repo", "file.ts")).toBe("C:/work/repo/file.ts")
    expect(joinPath("C:\\work\\repo\\", "file.ts")).toBe("C:/work/repo/file.ts")
  })
})

describe("baseName and parentOf", () => {
  it("splits posix paths", () => {
    expect(baseName("/work/repo/file.ts")).toBe("file.ts")
    expect(parentOf("/work/repo/file.ts")).toBe("/work/repo")
  })

  it("splits Windows paths", () => {
    expect(baseName("C:\\work\\repo\\file.ts")).toBe("file.ts")
    expect(parentOf("C:\\work\\repo\\file.ts")).toBe("C:/work/repo")
  })

  it("returns separator-free input unchanged", () => {
    expect(baseName("file.ts")).toBe("file.ts")
    expect(parentOf("file.ts")).toBe("file.ts")
  })
})

describe("relativeTo", () => {
  it("strips the workspace prefix", () => {
    expect(relativeTo("/work/repo", "/work/repo/src/file.ts")).toBe("src/file.ts")
  })

  it("handles mixed separators", () => {
    expect(relativeTo("C:\\work\\repo", "C:/work/repo/src/file.ts")).toBe("src/file.ts")
    expect(relativeTo("C:/work/repo", "C:\\work\\repo\\src\\file.ts")).toBe("src/file.ts")
  })

  it("returns paths outside the root unchanged, in posix form", () => {
    expect(relativeTo("/work/repo", "/elsewhere/file.ts")).toBe("/elsewhere/file.ts")
  })
})

describe("isValidName", () => {
  it("rejects separators and directory shorthand", () => {
    expect(isValidName("file.ts")).toBe(true)
    expect(isValidName("a/b")).toBe(false)
    expect(isValidName("a\\b")).toBe(false)
    expect(isValidName(".")).toBe(false)
    expect(isValidName("..")).toBe(false)
    expect(isValidName("")).toBe(false)
  })
})

describe("hasSeparator", () => {
  it("detects either spelling", () => {
    expect(hasSeparator("a/b")).toBe(true)
    expect(hasSeparator("a\\b")).toBe(true)
    expect(hasSeparator("ab")).toBe(false)
  })
})

describe("isUnder", () => {
  it("accepts the root itself and its descendants", () => {
    expect(isUnder("/work/repo", "/work/repo")).toBe(true)
    expect(isUnder("/work/repo", "/work/repo/src/file.ts")).toBe(true)
  })

  it("rejects prefix-only sibling matches", () => {
    expect(isUnder("/work/repo", "/work/repository/file.ts")).toBe(false)
  })

  it("compares Windows paths in posix form", () => {
    expect(isUnder("C:\\work\\repo", "C:/work/repo/src/file.ts")).toBe(true)
    expect(isUnder("C:/work/repo", "D:/work/repo/src/file.ts")).toBe(false)
  })
})
