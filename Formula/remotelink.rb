class Remotelink < Formula
  desc "Controlled remote computer access for AI"
  homepage "https://remotearc.app"
  version "0.6.0"
  conflicts_with "remotelink-go", because: "both install remotelink"

  on_macos do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.0/remotelink-v0.6.0-darwin-arm64", using: :nounzip
      sha256 "c925ea34fc5c21ef7887bdd3f6419f842f9f8d6428f8bff0c5cd5ffdfc756d1a"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.0/remotelink-v0.6.0-darwin-amd64", using: :nounzip
      sha256 "42745f91718fa5d981097d3216a4c2df5ba6eb9872534c18e044fa1658d6139f"
    end
  end
  on_linux do
    on_arm do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.0/remotelink-v0.6.0-linux-arm64", using: :nounzip
      sha256 "83aa675c78b60d0e9390fb4918b8910660bccb6ce0c80dd291213faee4eaef21"
    end
    on_intel do
      url "https://github.com/yaohuangguan/remote-arc/releases/download/remotelink-v0.6.0/remotelink-v0.6.0-linux-amd64", using: :nounzip
      sha256 "03609d23c9f0e5322d3a67d94c09ea1f177cc1754d8dc53c8b7e568ba0e24058"
    end
  end

  def install
    bin.install Dir["remotelink-v*"].first => "remotelink"
    chmod 0755, bin/"remotelink"
  end

  test do
    assert_equal "0.6.0", shell_output("#{bin}/remotelink --version").strip
  end
end
