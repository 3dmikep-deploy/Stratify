# Contributing to G-Code Analyzer

Thank you for your interest in contributing to G-Code Analyzer! This guide will help you get started with contributing to this project.

## 🤝 Code of Conduct

By participating in this project, you are expected to uphold our Code of Conduct. Please report unacceptable behavior to support@gcode-analyzer.dev.

### Our Pledge
We pledge to make participation in our project a harassment-free experience for everyone, regardless of age, body size, disability, ethnicity, gender identity and expression, level of experience, nationality, personal appearance, race, religion, or sexual identity and orientation.

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+ 
- **Python** 3.9+
- **Docker** & Docker Compose
- **Git**
- **C++** compiler (for native modules)

### Development Setup

1. **Fork and clone the repository**
```bash
git clone https://github.com/your-username/gcode-analyzer.git
cd gcode-analyzer
```

2. **Set up the development environment**
```bash
# Install dependencies for all services
npm run install-all

# Or install individually
cd api-service && npm install
cd ../web-dashboard && npm install  
cd ../desktop && npm install
cd ../parser-core/python && pip install -r requirements.txt
```

3. **Start the development environment**
```bash
# Using Docker (recommended)
docker-compose up -d

# Or start services individually
npm run dev:api      # API service on port 3001
npm run dev:web      # Web dashboard on port 3000  
npm run dev:desktop  # Desktop app
```

## 📁 Project Structure

```
gcode-analyzer/
├── api-service/           # Express.js API server
├── web-dashboard/         # React web interface
├── desktop/              # Electron desktop app
├── parser-core/          # Core analysis engine
│   ├── python/          # Python implementation
│   ├── cpp/             # C++ performance modules
│   └── bindings/        # Language bindings
├── shared/               # Shared utilities
│   ├── types/           # TypeScript definitions
│   └── utils/           # Common functions
├── docker-compose.yaml   # Development stack
└── docs/                # Documentation
```

## 🛠️ Development Workflow

### 1. Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
git checkout -b bugfix/issue-description
git checkout -b docs/documentation-update
```

### 2. Make Your Changes
- Follow our [coding standards](#coding-standards)
- Write tests for new functionality
- Update documentation as needed
- Test your changes thoroughly

### 3. Commit Your Changes
We use [Conventional Commits](https://www.conventionalcommits.org/) format:

```bash
# Examples:
git commit -m "feat(api): add batch analysis endpoint"
git commit -m "fix(parser): handle malformed G-code comments"
git commit -m "docs(readme): update installation instructions"
git commit -m "test(analyzer): add layer parsing tests"
```

### 4. Push and Create Pull Request
```bash
git push origin feature/your-feature-name
```

Then create a Pull Request through GitHub's interface.

## 🎯 Types of Contributions

### 🐛 Bug Reports
When filing a bug report, please include:
- Clear, descriptive title
- Steps to reproduce the issue
- Expected vs actual behavior
- Environment details (OS, browser, versions)
- Sample G-code file (if applicable)
- Screenshots or logs

**Use the [Bug Report Template](.github/ISSUE_TEMPLATE/bug_report.md)**

### ✨ Feature Requests
For feature requests, please include:
- Clear description of the feature
- Use case and motivation
- Proposed implementation approach
- Potential impact on existing functionality

**Use the [Feature Request Template](.github/ISSUE_TEMPLATE/feature_request.md)**

### 📖 Documentation
Documentation contributions are always welcome:
- API documentation
- User guides and tutorials
- Code comments and README updates
- Wiki articles and examples

### 🧪 Testing
Help improve test coverage:
- Unit tests for new features
- Integration tests for workflows
- End-to-end tests for user scenarios
- Performance and load tests

## 🎨 Coding Standards

### TypeScript/JavaScript
- **ESLint + Prettier** for code formatting
- **Strict TypeScript** configuration
- **Functional programming** preferred where appropriate
- **Comprehensive JSDoc** comments for public APIs

```typescript
/**
 * Analyzes G-code file and extracts metadata
 * @param filepath - Path to the G-code file
 * @param options - Analysis configuration options
 * @returns Promise resolving to analysis results
 */
export async function analyzeGCode(
  filepath: string, 
  options: AnalysisOptions
): Promise<AnalysisResult> {
  // Implementation
}
```

### Python
- **Black** for code formatting
- **flake8** for linting
- **Type hints** for all function signatures
- **Google style** docstrings

```python
def analyze_gcode(filepath: str, options: Dict[str, Any]) -> AnalysisResult:
    """Analyze G-code file and extract comprehensive data.
    
    Args:
        filepath: Path to the G-code file to analyze
        options: Configuration options for analysis
        
    Returns:
        AnalysisResult containing all extracted data and metrics
        
    Raises:
        ValueError: If filepath is invalid or file is corrupted
        IOError: If file cannot be read
    """
```

### C++
- **clang-format** with Google style
- **Modern C++17** standards
- **RAII** for resource management
- **const-correctness** throughout

```cpp
class GCodeParser {
public:
    /**
     * Parse G-code file and extract commands
     * @param filepath Path to G-code file
     * @return Vector of parsed commands
     */
    std::vector<GCodeCommand> parseFile(const std::string& filepath) const;
    
private:
    bool validateCommand(const GCodeCommand& cmd) const noexcept;
};
```

## 🧪 Testing Guidelines

### Test Structure
```
tests/
├── unit/              # Unit tests
├── integration/       # Integration tests
├── e2e/              # End-to-end tests
├── fixtures/         # Test data and fixtures
└── utils/            # Testing utilities
```

### Writing Tests

#### JavaScript/TypeScript (Jest)
```typescript
describe('GCodeParser', () => {
  describe('parseCommand', () => {
    it('should parse basic G1 command', () => {
      const result = parseCommand('G1 X10 Y20 F3000');
      expect(result).toEqual({
        type: 'G',
        code: 1,
        params: { X: 10, Y: 20, F: 3000 }
      });
    });
    
    it('should handle invalid commands gracefully', () => {
      const result = parseCommand('INVALID');
      expect(result).toBeNull();
    });
  });
});
```

#### Python (pytest)
```python
import pytest
from gcode_analyzer import GCodeAnalyzer

class TestGCodeAnalyzer:
    def test_load_file_success(self, sample_gcode_file):
        analyzer = GCodeAnalyzer(sample_gcode_file)
        assert analyzer.commands is not None
        assert len(analyzer.commands) > 0
    
    def test_analyze_layers(self, analyzer_with_data):
        layers = analyzer_with_data.analyze_layers()
        assert len(layers) > 0
        assert all(layer.z_height >= 0 for layer in layers)
```

### Running Tests
```bash
# All tests
npm test

# Specific test suites
npm run test:unit
npm run test:integration
npm run test:e2e

# Python tests
cd parser-core/python
pytest tests/ -v

# C++ tests (if available)
cd parser-core/cpp
make test
```

## 📚 Documentation

### API Documentation
- Use **OpenAPI/Swagger** for API documentation
- Include request/response examples
- Document error conditions and status codes

### Code Documentation
- **JSDoc** for TypeScript/JavaScript
- **Sphinx** for Python documentation
- **Doxygen** for C++ documentation

### User Documentation
- **README.md** for quick start
- **Wiki** for detailed guides
- **Examples** directory with sample code

## 🔧 Development Tools

### Recommended VS Code Extensions
- **TypeScript Hero** - Import management
- **ESLint** - JavaScript/TypeScript linting
- **Prettier** - Code formatting
- **Python** - Python language support
- **C/C++** - C++ language support
- **Docker** - Container management
- **GitLens** - Git integration

### Useful Commands
```bash
# Code formatting
npm run format          # Format all code
npm run format:check    # Check formatting

# Linting
npm run lint           # Lint all code
npm run lint:fix       # Fix linting issues

# Type checking
npm run type-check     # Check TypeScript types

# Build
npm run build          # Build all packages
npm run build:api      # Build API service
npm run build:web      # Build web dashboard
npm run build:desktop  # Build desktop app

# Docker
docker-compose up -d              # Start development stack
docker-compose logs -f api-service # View service logs
docker-compose exec api-service bash # Shell into container
```

## 🚀 Pull Request Process

### Before Submitting
1. ✅ **Code is properly formatted** (`npm run format`)
2. ✅ **All linting passes** (`npm run lint`)
3. ✅ **Tests pass locally** (`npm test`)
4. ✅ **Documentation updated** (if applicable)
5. ✅ **Changeset created** (if applicable)

### PR Description Template
```markdown
## Description
Brief description of the changes

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)  
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## Testing
- [ ] Unit tests pass
- [ ] Integration tests pass
- [ ] Manual testing completed

## Screenshots (if applicable)
Add screenshots to help explain your changes

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review of my code
- [ ] I have commented my code, particularly in hard-to-understand areas
- [ ] I have made corresponding changes to the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix is effective or that my feature works
```

### Review Process
1. **Automated checks** must pass (CI/CD)
2. **Code review** by at least one maintainer
3. **Testing** in staging environment
4. **Documentation review** (if applicable)
5. **Final approval** and merge

## 🏷️ Release Process

### Version Numbering
We follow [Semantic Versioning](https://semver.org/):
- **MAJOR** version for incompatible API changes
- **MINOR** version for backwards-compatible functionality
- **PATCH** version for backwards-compatible bug fixes

### Release Workflow
1. **Create release branch** from `develop`
2. **Update version numbers** and changelog
3. **Run full test suite** and quality checks
4. **Merge to main** branch
5. **Create Git tag** and GitHub release
6. **Deploy to production** environments

## 🎉 Recognition

Contributors are recognized in:
- **CONTRIBUTORS.md** file
- **GitHub contributors** section
- **Release notes** for significant contributions
- **Annual report** and project statistics

## ❓ Getting Help

### Community Channels
- **GitHub Discussions** - General questions and ideas
- **GitHub Issues** - Bug reports and feature requests
- **Discord** - Real-time chat with the community
- **Stack Overflow** - Technical questions (tag: gcode-analyzer)

### Maintainer Contact
- **Email**: maintainers@gcode-analyzer.dev
- **Twitter**: [@gcodeanalyzer](https://twitter.com/gcodeanalyzer)

## 📄 License

By contributing to G-Code Analyzer, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to G-Code Analyzer! 🙏
